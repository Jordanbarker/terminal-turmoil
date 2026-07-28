import * as AST from "../parser/ast";
import * as Plan from "./plan";

export interface PlannerContext {
  currentDatabase: string;
  currentSchema: string;
  cteScopes?: Map<string, AST.SelectStatement>;
}

/**
 * Translate a SelectStatement AST into a LogicalPlan tree.
 * Non-select statements (DDL, DML) are executed directly by the executor — they don't need planning.
 */
export function planSelect(stmt: AST.SelectStatement, ctx: PlannerContext): Plan.LogicalPlan {
  // Register CTEs
  const cteScopes = new Map(ctx.cteScopes);
  if (stmt.ctes) {
    for (const cte of stmt.ctes) {
      cteScopes.set(cte.name.toUpperCase(), cte.query);
    }
  }
  const innerCtx = { ...ctx, cteScopes };

  let plan: Plan.LogicalPlan;

  // FROM clause
  if (stmt.from) {
    plan = planTableRef(stmt.from, innerCtx);
  } else {
    plan = { kind: "empty" };
  }

  // WHERE
  if (stmt.where) {
    plan = { kind: "filter", source: plan, condition: stmt.where };
  }

  // GROUP BY + HAVING
  if (stmt.groupBy || hasAggregates(stmt.items)) {
    plan = { kind: "aggregate", source: plan, groupBy: stmt.groupBy ?? [], having: stmt.having };
  }

  // SELECT (projection)
  plan = {
    kind: "project",
    source: plan,
    expressions: stmt.items.map((i) => ({ expr: i.expr, alias: i.alias })),
  };

  // QUALIFY is handled in executeSelect after window functions — not here

  // DISTINCT
  if (stmt.distinct) {
    plan = { kind: "distinct", source: plan };
  }

  // ORDER BY
  if (stmt.orderBy) {
    plan = { kind: "sort", source: plan, orderBy: resolveOrderBy(stmt.orderBy, stmt.items) };
  }

  // LIMIT / OFFSET / TOP
  if (stmt.limit || stmt.offset || stmt.top) {
    plan = {
      kind: "limit",
      source: plan,
      count: stmt.limit ?? (stmt.top ? { kind: "number_literal", value: stmt.top } : undefined),
      offset: stmt.offset,
    };
  }

  // Set operations are handled in executeSelect after projection — not here

  return plan;
}

/**
 * Rewrite ORDER BY terms that name the select list rather than the source:
 * an ordinal (`ORDER BY 2`) or a select-list alias (`ORDER BY total`). Sorting
 * runs before projection, so those terms would otherwise evaluate to NULL and
 * silently leave the rows unsorted. Anything that already resolves against the
 * source rows is left untouched.
 *
 * A `*` in the select list has no column list until execution time, so
 * ordinals are left for the sort node to resolve against the expanded star
 * (see `executePlan`); that is also why the range check is skipped here.
 */
export function resolveOrderBy(orderBy: AST.OrderByItem[], items: AST.SelectItem[]): AST.OrderByItem[] {
  const hasStar = items.some((i) => i.expr.kind === "star_ref");
  return orderBy.map((item) => {
    const expr = ordinalTarget(item.expr, items, hasStar) ?? substituteAliases(item.expr, items);
    return expr === item.expr ? item : { ...item, expr };
  });
}

/**
 * A numeric ORDER BY term is always a select-list position in Snowflake, so
 * anything that cannot be one (negative, fractional, out of range) is an
 * error rather than a constant that quietly sorts nothing.
 */
function ordinalTarget(expr: AST.Expression, items: AST.SelectItem[], hasStar: boolean): AST.Expression | undefined {
  const position = ordinalValue(expr);
  if (position === undefined) return undefined;
  if (Number.isInteger(position) && position >= 1) {
    // With a star the real column list only exists at execution time, so the
    // range check waits until the sort node can expand it.
    if (hasStar) return undefined;
    const item = items[position - 1];
    if (item) return item.expr;
  }
  throw new Error(`ORDER BY position ${position} is not in select list`);
}

function ordinalValue(expr: AST.Expression): number | undefined {
  if (expr.kind === "number_literal") return expr.value;
  if (expr.kind === "unary_expr" && expr.op === "-" && expr.operand.kind === "number_literal") {
    return -expr.operand.value;
  }
  return undefined;
}

/**
 * Replace every bare identifier that names a select-list alias with that
 * item's expression, at any depth, so `ORDER BY ABS(total)` sorts the same way
 * `ORDER BY total` does. Substituted expressions are not re-walked, so
 * `SELECT x AS x` cannot recurse forever. Returns the original node when
 * nothing matched, letting callers detect a no-op by identity.
 */
function substituteAliases(expr: AST.Expression, items: AST.SelectItem[]): AST.Expression {
  const walk = (e: AST.Expression): AST.Expression => {
    switch (e.kind) {
      case "column_ref": {
        if (e.table) return e;
        const name = e.column.toUpperCase();
        // An explicit alias wins over a same-named source column, as in Snowflake.
        const item = items.find((i) => i.alias?.toUpperCase() === name);
        return item ? item.expr : e;
      }
      case "binary_expr": return rebuild(e, { left: walk(e.left), right: walk(e.right) });
      case "unary_expr": return rebuild(e, { operand: walk(e.operand) });
      case "function_call": return rebuild(e, { args: walkAll(e.args) });
      case "aggregate_call": return e.arg ? rebuild(e, { arg: walk(e.arg) }) : e;
      case "cast_expr": return rebuild(e, { expr: walk(e.expr) });
      case "case_expr": return rebuild(e, {
        operand: e.operand ? walk(e.operand) : undefined,
        whenClauses: e.whenClauses.map((wc) => ({ when: walk(wc.when), then: walk(wc.then) })),
        elseClause: e.elseClause ? walk(e.elseClause) : undefined,
      });
      case "between_expr": return rebuild(e, { expr: walk(e.expr), low: walk(e.low), high: walk(e.high) });
      case "like_expr": return rebuild(e, { expr: walk(e.expr), pattern: walk(e.pattern) });
      case "is_null_expr": return rebuild(e, { expr: walk(e.expr) });
      case "in_expr": return e.values ? rebuild(e, { expr: walk(e.expr), values: walkAll(e.values) }) : rebuild(e, { expr: walk(e.expr) });
      case "array_construct": return rebuild(e, { elements: walkAll(e.elements) });
      case "dot_access": return rebuild(e, { object: walk(e.object) });
      case "bracket_access": return rebuild(e, { object: walk(e.object), index: walk(e.index) });
      // Window calls resolve after the sort runs, and subqueries carry their
      // own scope; neither can borrow an outer alias.
      default: return e;
    }
  };
  const walkAll = (exprs: AST.Expression[]): AST.Expression[] => {
    const next = exprs.map(walk);
    return next.some((e, i) => e !== exprs[i]) ? next : exprs;
  };
  return walk(expr);
}

/** Rebuild `node` only if a rewritten child actually changed. */
function rebuild<T extends AST.Expression>(node: T, changes: Partial<T>): T {
  for (const [key, value] of Object.entries(changes)) {
    if (value !== (node as unknown as Record<string, unknown>)[key]) return { ...node, ...changes };
  }
  return node;
}

function planTableRef(ref: AST.TableRef, ctx: PlannerContext): Plan.LogicalPlan {
  switch (ref.kind) {
    case "table_name": {
      const parts = ref.name;
      const upperName = parts[parts.length - 1].toUpperCase();

      // Check CTE scope
      if (parts.length === 1 && ctx.cteScopes?.has(upperName)) {
        const cteQuery = ctx.cteScopes.get(upperName)!;
        return {
          kind: "derived",
          query: withOuterCtes(cteQuery, ctx, upperName),
          alias: ref.alias ?? parts[0],
        };
      }

      let db: string, schema: string, table: string;
      if (parts.length === 3) {
        db = parts[0]; schema = parts[1]; table = parts[2];
      } else if (parts.length === 2) {
        db = ctx.currentDatabase; schema = parts[0]; table = parts[1];
      } else {
        db = ctx.currentDatabase; schema = ctx.currentSchema; table = parts[0];
      }
      return { kind: "scan", database: db.toUpperCase(), schema: schema.toUpperCase(), table: table.toUpperCase(), alias: ref.alias ?? undefined };
    }

    case "subquery_table": {
      return {
        kind: "derived",
        query: withOuterCtes(ref.query, ctx),
        alias: ref.alias ?? undefined,
      };
    }

    case "flatten_table": {
      return {
        kind: "flatten",
        source: { kind: "empty" },
        input: ref.input,
        path: ref.path,
        outer: ref.outer,
        alias: ref.alias ?? undefined,
      };
    }

    case "joined_table": {
      const left = planTableRef(ref.left, ctx);
      const right = planTableRef(ref.right, ctx);
      return { kind: "join", joinType: ref.joinType, left, right, condition: ref.condition };
    }
  }
}

/**
 * The derived query is re-planned from scratch at execution time, so the
 * planner's CTE scope must travel with it: attach the in-scope CTEs as the
 * query's own (unless it already defines some). `excludeName` drops the CTE's
 * own name so a self-reference falls through to table resolution instead of
 * recursing forever.
 */
function withOuterCtes(
  query: AST.SelectStatement,
  ctx: PlannerContext,
  excludeName?: string,
): AST.SelectStatement {
  if (query.ctes || !ctx.cteScopes || ctx.cteScopes.size === 0) return query;
  const ctes: AST.CTE[] = [];
  for (const [name, cteQuery] of ctx.cteScopes) {
    if (name !== excludeName) ctes.push({ name, query: cteQuery });
  }
  if (ctes.length === 0) return query;
  return { ...query, ctes };
}

function hasAggregates(items: AST.SelectItem[]): boolean {
  return items.some((i) => containsAggregate(i.expr));
}

function containsAggregate(expr: AST.Expression): boolean {
  switch (expr.kind) {
    case "aggregate_call":
      return true;
    case "function_call":
      return expr.args.some(containsAggregate);
    case "binary_expr":
      return containsAggregate(expr.left) || containsAggregate(expr.right);
    case "unary_expr":
      return containsAggregate(expr.operand);
    case "case_expr":
      return expr.whenClauses.some((wc) => containsAggregate(wc.when) || containsAggregate(wc.then)) ||
             (expr.elseClause ? containsAggregate(expr.elseClause) : false);
    case "window_call":
      return false; // Window functions aren't aggregates for GROUP BY purposes
    default:
      return false;
  }
}

export type { PlannerContext as PlanContext };
