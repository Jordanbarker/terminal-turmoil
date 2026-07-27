import { SnowflakeState } from "../state";
import { Row, Value, DataType } from "../types";
import { tokenize } from "../lexer/lexer";
import { parseMultiple } from "../parser/parser";
import { ParseError } from "../parser/errors";
import { planSelect, resolveOrderBy } from "../planner/planner";
import * as Plan from "../planner/plan";
import * as AST from "../parser/ast";
import { QueryResult, ResultSet } from "../formatter/result_types";
import { evaluate, EvalContext, evalContextFromSession, toBool } from "./evaluator";
import { nestedLoopJoin } from "./joins";
import { executeAggregation } from "./aggregation";
import { executeWindowFunctions } from "./window_exec";
import { sortRows } from "./sort";
import { executeDDL } from "./ddl";
import { executeDML } from "./dml";
import { executeShow, executeDescribe, executeUse } from "./show_describe";
import { executeCopyInto } from "./copy_staging";
import { SessionContext } from "../session/context";
import { tableNotFoundError } from "./resolve";
import { checkPermission } from "../session/permissions";

export interface ExecutionResult {
  results: QueryResult[];
  state: SnowflakeState;
  context: SessionContext;
}

/**
 * Execute one or more SQL statements against a SnowflakeState.
 * Returns results for each statement plus the new state.
 */
export function execute(sql: string, state: SnowflakeState, ctx: SessionContext, preParsed?: AST.Statement[]): ExecutionResult {
  let currentState = state;
  let currentCtx = ctx;
  const results: QueryResult[] = [];

  try {
    const statements = preParsed ?? parseMultiple(tokenize(sql));

    for (const stmt of statements) {
      const { result, newState, newCtx } = executeStatement(stmt, currentState, currentCtx);
      results.push(result);
      if (newState) currentState = newState;
      if (newCtx) currentCtx = newCtx;
    }
  } catch (e) {
    if (e instanceof ParseError) {
      results.push({
        type: "error",
        message: e.message,
        position: e.position ? { line: e.position.line, column: e.position.column } : undefined,
      });
    } else {
      results.push({ type: "error", message: (e as Error).message ?? String(e) });
    }
  }

  return { results, state: currentState, context: currentCtx };
}

function executeStatement(
  stmt: AST.Statement,
  state: SnowflakeState,
  ctx: SessionContext
): { result: QueryResult; newState?: SnowflakeState; newCtx?: SessionContext } {
  try {
    switch (stmt.kind) {
      case "select": {
        const result = executeSelect(stmt, state, ctx);
        return { result };
      }

      case "insert": case "update": case "delete": case "merge": {
        const { result, state: newState } = executeDML(stmt, state, ctx);
        return { result, newState };
      }

      case "create_database": case "create_schema": case "create_table":
      case "create_view": case "create_warehouse": case "create_stage":
      case "create_sequence": case "alter_table": case "drop": case "truncate": {
        const { result, state: newState } = executeDDL(stmt, state, ctx);
        return { result, newState };
      }

      case "show": {
        const result = executeShow(stmt, state, ctx);
        return { result };
      }

      case "describe": {
        const result = executeDescribe(stmt, state, ctx);
        return { result };
      }

      case "use": {
        const { result, ctx: newCtx } = executeUse(stmt, state, ctx);
        return { result, newCtx };
      }

      case "copy_into": {
        const { result, state: newState } = executeCopyInto(stmt, state, ctx);
        return { result, newState };
      }

      case "set_compound": {
        let currentState = state;
        let currentCtx = ctx;
        let lastResult: QueryResult = { type: "status", data: { message: "Statement executed successfully." } };
        for (const s of stmt.statements) {
          const r = executeStatement(s, currentState, currentCtx);
          lastResult = r.result;
          if (r.newState) currentState = r.newState;
          if (r.newCtx) currentCtx = r.newCtx;
        }
        return { result: lastResult, newState: currentState, newCtx: currentCtx };
      }

      default:
        return { result: { type: "error", message: `Unsupported statement type: ${(stmt as { kind: string }).kind}` } };
    }
  } catch (e) {
    return { result: { type: "error", message: (e as Error).message ?? String(e) } };
  }
}

/**
 * Run a scalar / IN / EXISTS subquery and hand back its **projected** rows.
 * Going through `executeSelect` (rather than the bare plan) is what makes the
 * subquery's select list authoritative; `outerRow` keeps correlation working.
 */
function executeSubqueryInner(
  query: AST.SelectStatement,
  outerRow: Row,
  state: SnowflakeState,
  ctx: SessionContext,
  outerCtes?: AST.CTE[]
): Value[][] {
  // Merge outer CTEs if the subquery doesn't define its own
  const subQuery = { ...query, ctes: query.ctes ?? outerCtes };

  const result = executeSelect(subQuery, state, ctx, undefined, outerRow);
  if (result.type !== "resultset") {
    throw new Error(result.type === "error" ? result.message : "Subquery did not produce a result set");
  }
  return result.data.rows;
}

function executeSelect(
  stmt: AST.SelectStatement,
  state: SnowflakeState,
  ctx: SessionContext,
  parentEvalCtx?: EvalContext,
  outerRow?: Row,
): QueryResult {
  const evalCtx: EvalContext = evalContextFromSession(ctx, {
    executeSubquery: (query: AST.SelectStatement, subOuterRow: Row) => {
      return executeSubqueryInner(query, subOuterRow, state, ctx, stmt.ctes);
    },
    viewDepth: parentEvalCtx?.viewDepth,
  });
  evalCtx.columnTypes = new Map();

  const planCtx = {
    currentDatabase: ctx.currentDatabase,
    currentSchema: ctx.currentSchema,
  };

  const plan = planSelect(stmt, planCtx);
  let rows = executePlan(plan, state, evalCtx, stmt, outerRow);

  // Apply window functions
  rows = executeWindowFunctions(rows, stmt.items, evalCtx, stmt.qualify);

  // Project to final column list
  const { resultRows, columns } = projectRows(rows, stmt.items, evalCtx);

  // QUALIFY (post-window filter)
  let filteredRows = resultRows;
  if (stmt.qualify) {
    filteredRows = [];
    for (let i = 0; i < resultRows.length; i++) {
      // Build a lookup row with both original and projected values
      const lookupRow: Row = { ...rows[i] };
      for (let j = 0; j < columns.length; j++) {
        lookupRow[columns[j].name] = resultRows[i][j];
      }
      if (toBool(evaluate(stmt.qualify, lookupRow, evalCtx))) {
        filteredRows.push(resultRows[i]);
      }
    }
  }

  // DISTINCT — deduplicate projected rows
  if (stmt.distinct) {
    const seen = new Set<string>();
    filteredRows = filteredRows.filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Set operations
  if (stmt.setOp) {
    const rightResult = executeSelect(stmt.setOp.right, state, ctx, parentEvalCtx, outerRow);
    if (rightResult.type !== "resultset") return rightResult;
    return executeSetOp(stmt.setOp.type, { columns, rows: filteredRows, rowCount: filteredRows.length }, rightResult.data);
  }

  return {
    type: "resultset",
    data: { columns, rows: filteredRows, rowCount: filteredRows.length },
  };
}

/** Rebuild a SessionContext from an EvalContext (for executing a nested SELECT). */
function sessionFromEvalCtx(ctx: EvalContext): SessionContext {
  return {
    currentDatabase: ctx.currentDatabase,
    currentSchema: ctx.currentSchema,
    currentWarehouse: ctx.currentWarehouse,
    currentRole: ctx.currentRole,
    currentUser: ctx.currentUser,
    gameNow: ctx.gameNow,
  };
}

function executePlan(plan: Plan.LogicalPlan, state: SnowflakeState, ctx: EvalContext, originalStmt?: AST.SelectStatement, outerRow?: Row): Row[] {
  switch (plan.kind) {
    case "empty":
      return [outerRow ? { ...outerRow } : {}]; // Single empty row for SELECT without FROM

    case "derived": {
      // Derived table / CTE reference: run the inner query as a complete
      // SELECT so its projections (and window fns, ORDER BY, LIMIT) all
      // apply, then expose its output columns as row keys for the outer query.
      const result = executeSelect(plan.query, state, sessionFromEvalCtx(ctx), ctx);
      if (result.type !== "resultset") {
        throw new Error(result.type === "error" ? result.message : "Derived table did not produce a result set");
      }
      recordColumnTypes(ctx, result.data.columns, plan.alias);
      return result.data.rows.map((valueRow) => {
        const row: Row = { ...(outerRow ?? {}) };
        result.data.columns.forEach((col, i) => {
          row[col.name] = valueRow[i];
          if (plan.alias) row[`${plan.alias}.${col.name}`] = valueRow[i];
        });
        return row;
      });
    }

    case "scan": {
      if (!(ctx.viewDepth ?? 0)) {
        checkPermission(ctx.currentRole, plan.database, plan.schema, "READ");
      }
      const tbl = state.getTable(plan.database, plan.schema, plan.table);
      if (!tbl) {
        // Fall back to view expansion
        const view = state.getView(plan.database, plan.schema, plan.table);
        if (view) {
          const depth = ctx.viewDepth ?? 0;
          if (depth >= 10) {
            throw new Error("View expansion exceeded maximum depth (10). Possible circular view reference.");
          }
          const viewCtx: EvalContext = { ...ctx, viewDepth: depth + 1 };
          const viewStmt = parseMultiple(tokenize(view.query))[0] as AST.SelectStatement;
          const viewResult = executeSelect(viewStmt, state, sessionFromEvalCtx(ctx), viewCtx);
          if (viewResult.type === "resultset") {
            recordColumnTypes(ctx, viewResult.data.columns, plan.alias);
            return viewResult.data.rows.map((valueRow) => {
              const row: Row = { ...(outerRow ?? {}) };
              viewResult.data.columns.forEach((col, i) => {
                row[col.name] = valueRow[i];
                if (plan.alias) row[`${plan.alias}.${col.name}`] = valueRow[i];
              });
              return row;
            });
          }
        }
        throw new Error(tableNotFoundError(`${plan.database}.${plan.schema}.${plan.table}`));
      }

      recordColumnTypes(ctx, tbl.columns, plan.alias);

      // Prefix columns with alias if present, merge outer row for correlated subqueries
      const rows = tbl.rows.map((row) => {
        const result: Row = { ...(outerRow ?? {}), ...row };
        if (plan.alias) {
          for (const [k, v] of Object.entries(row)) {
            result[`${plan.alias}.${k}`] = v;
          }
        }
        return result;
      });
      return rows;
    }

    case "filter": {
      const sourceRows = executePlan(plan.source, state, ctx, originalStmt, outerRow);
      return sourceRows.filter((row) => {
        const val = evaluate(plan.condition, row, ctx);
        return toBool(val);
      });
    }

    case "project": {
      // Don't project here — projection happens in projectRows after window functions
      return executePlan(plan.source, state, ctx, originalStmt, outerRow);
    }

    case "join": {
      const leftRows = executePlan(plan.left, state, ctx, originalStmt, outerRow);

      // LATERAL FLATTEN: evaluate right side per-left-row
      if (plan.right.kind === "flatten") {
        const result: Row[] = [];
        for (const leftRow of leftRows) {
          const flattenedRows = executePlan(plan.right, state, ctx, originalStmt, leftRow);
          result.push(...flattenedRows);
        }
        return result;
      }

      const rightRows = executePlan(plan.right, state, ctx, originalStmt, outerRow);
      const rightCols = rightRows.length > 0 ? Object.keys(rightRows[0]) : [];
      return nestedLoopJoin(leftRows, rightRows, plan.joinType, plan.condition, ctx, rightCols);
    }

    case "aggregate": {
      const sourceRows = executePlan(plan.source, state, ctx, originalStmt, outerRow);
      const items = originalStmt?.items ?? [];
      let aggRows = executeAggregation(sourceRows, plan.groupBy, items, ctx);

      // HAVING
      if (plan.having) {
        aggRows = aggRows.filter((row) => toBool(evaluate(plan.having!, row, ctx)));
      }

      return aggRows;
    }

    case "sort": {
      const sourceRows = executePlan(plan.source, state, ctx, originalStmt, outerRow);
      // `SELECT * ... ORDER BY <ordinal>`: the planner had no column list to
      // count against, so resolve the ordinal now that the star can expand.
      const items = originalStmt?.items;
      const sample = items?.some((i) => i.expr.kind === "star_ref") ? starSampleRow(sourceRows, ctx) : undefined;
      const orderBy = items && sample
        ? resolveOrderBy(plan.orderBy, expandSelectItems(items, sample))
        : plan.orderBy;
      return sortRows(sourceRows, orderBy, ctx);
    }

    case "limit": {
      const sourceRows = executePlan(plan.source, state, ctx, originalStmt, outerRow);
      let offset = 0;
      let count = sourceRows.length;

      if (plan.offset) {
        offset = Number(evaluate(plan.offset, {}, ctx)) || 0;
      }
      if (plan.count) {
        count = Number(evaluate(plan.count, {}, ctx));
      }

      return sourceRows.slice(offset, offset + count);
    }

    case "distinct": {
      const sourceRows = executePlan(plan.source, state, ctx, originalStmt, outerRow);
      const seen = new Set<string>();
      return sourceRows.filter((row) => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    case "union": {
      const leftRows = executePlan(plan.left, state, ctx, originalStmt, outerRow);
      const rightRows = executePlan(plan.right, state, ctx, originalStmt, outerRow);

      switch (plan.type) {
        case "UNION ALL":
          return [...leftRows, ...rightRows];
        case "UNION": {
          const all = [...leftRows, ...rightRows];
          const seen = new Set<string>();
          return all.filter((row) => {
            const key = JSON.stringify(row);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        case "INTERSECT": {
          const rightKeys = new Set(rightRows.map((r) => JSON.stringify(r)));
          return leftRows.filter((r) => rightKeys.has(JSON.stringify(r)));
        }
        case "EXCEPT": {
          const rightKeys = new Set(rightRows.map((r) => JSON.stringify(r)));
          return leftRows.filter((r) => !rightKeys.has(JSON.stringify(r)));
        }
      }
      break;
    }

    case "flatten": {
      const sourceRows = executePlan(plan.source, state, ctx, originalStmt, outerRow);
      const result: Row[] = [];

      for (const row of sourceRows) {
        let val = evaluate(plan.input, row, ctx);

        // Apply path if specified
        if (plan.path && val != null && typeof val === "object" && !Array.isArray(val)) {
          val = (val as Record<string, Value>)[plan.path] ?? null;
        }

        if (Array.isArray(val)) {
          for (let i = 0; i < val.length; i++) {
            const element = val[i];
            const flatRow: Row = { ...row };
            flatRow["SEQ"] = 1;
            flatRow["KEY"] = i;
            flatRow["PATH"] = String(i);
            flatRow["INDEX"] = i;
            flatRow["VALUE"] = element;
            flatRow["THIS"] = val;
            if (plan.alias) {
              flatRow[`${plan.alias}.SEQ`] = 1;
              flatRow[`${plan.alias}.KEY`] = i;
              flatRow[`${plan.alias}.PATH`] = String(i);
              flatRow[`${plan.alias}.INDEX`] = i;
              flatRow[`${plan.alias}.VALUE`] = element;
              flatRow[`${plan.alias}.THIS`] = val;
            }
            result.push(flatRow);
          }
        } else if (val != null && typeof val === "object") {
          const obj = val as Record<string, Value>;
          const keys = Object.keys(obj);
          for (let i = 0; i < keys.length; i++) {
            const flatRow: Row = { ...row };
            flatRow["SEQ"] = 1;
            flatRow["KEY"] = keys[i];
            flatRow["PATH"] = keys[i];
            flatRow["INDEX"] = i;
            flatRow["VALUE"] = obj[keys[i]];
            flatRow["THIS"] = val;
            if (plan.alias) {
              flatRow[`${plan.alias}.SEQ`] = 1;
              flatRow[`${plan.alias}.KEY`] = keys[i];
              flatRow[`${plan.alias}.PATH`] = keys[i];
              flatRow[`${plan.alias}.INDEX`] = i;
              flatRow[`${plan.alias}.VALUE`] = obj[keys[i]];
              flatRow[`${plan.alias}.THIS`] = val;
            }
            result.push(flatRow);
          }
        } else if (plan.outer) {
          // OUTER: emit a row with NULLs for flatten columns
          const flatRow: Row = { ...row };
          flatRow["SEQ"] = null;
          flatRow["KEY"] = null;
          flatRow["PATH"] = null;
          flatRow["INDEX"] = null;
          flatRow["VALUE"] = null;
          flatRow["THIS"] = null;
          result.push(flatRow);
        }
        // If not OUTER and val is null/scalar, skip (no rows emitted)
      }

      return result;
    }

    case "values":
      return plan.rows.map((row) => {
        const result: Row = {};
        row.forEach((expr, i) => {
          result[`column${i + 1}`] = evaluate(expr, {}, ctx);
        });
        return result;
      });
  }

  return [];
}

/**
 * Remember the declared types of a source's columns so projection can type its
 * output (only DATE/TIMESTAMP/TIME are actually consumed, see `inferType`).
 * First writer wins, so the leftmost table of a join owns an ambiguous name.
 */
function recordColumnTypes(
  ctx: EvalContext,
  columns: { name: string; type: DataType }[],
  alias?: string,
): void {
  const types = ctx.columnTypes;
  if (!types) return;
  for (const col of columns) {
    const name = col.name.toUpperCase();
    if (!types.has(name)) types.set(name, col.type);
    if (alias) {
      const qualified = `${alias.toUpperCase()}.${name}`;
      if (!types.has(qualified)) types.set(qualified, col.type);
    }
  }
}

/**
 * A row shaped like the star's output, for expanding `SELECT *`. With no
 * result rows the scanned schema stands in, so an out-of-range `ORDER BY <n>`
 * still errors on an empty result instead of quietly returning nothing.
 */
function starSampleRow(rows: Row[], ctx: EvalContext): Row | undefined {
  if (rows.length > 0) return rows[0];
  const types = ctx.columnTypes;
  if (!types) return undefined;
  const sample: Row = {};
  for (const key of types.keys()) {
    if (!key.includes(".")) sample[key] = null;
  }
  return Object.keys(sample).length > 0 ? sample : undefined;
}

/** Resolve `*` / `alias.*` against a sample row; other items pass through. */
function expandSelectItems(items: AST.SelectItem[], sampleRow?: Row): { expr: AST.Expression; alias?: string }[] {
  const expanded: { expr: AST.Expression; alias?: string }[] = [];
  for (const item of items) {
    if (item.expr.kind === "star_ref" && !item.expr.table) {
      // SELECT * — use all keys from the sample row
      if (sampleRow) {
        for (const key of Object.keys(sampleRow)) {
          // Skip internal keys (prefixed with __)
          if (key.startsWith("__")) continue;
          // Skip table.column duplicates (keep only unprefixed)
          if (key.includes(".")) continue;
          expanded.push({ expr: { kind: "column_ref", column: key }, alias: key });
        }
      }
      continue;
    }
    if (item.expr.kind === "star_ref" && item.expr.table) {
      // SELECT t.* — expand columns prefixed with table alias
      if (sampleRow) {
        const prefix = item.expr.table + ".";
        for (const key of Object.keys(sampleRow)) {
          if (key.startsWith(prefix)) {
            const colName = key.slice(prefix.length);
            expanded.push({ expr: { kind: "column_ref", column: key }, alias: colName });
          }
        }
      }
      continue;
    }
    expanded.push(item);
  }
  return expanded;
}

function projectRows(
  rows: Row[],
  items: AST.SelectItem[],
  ctx: EvalContext
): { resultRows: Value[][]; columns: { name: string; type: DataType }[] } {
  const expandedItems = expandSelectItems(items, rows[0]);

  const columns: { name: string; type: DataType }[] = expandedItems.map((item) => ({
    name: (item.alias ?? inferColumnName(item.expr)).toUpperCase(),
    type: inferType(item.expr, ctx.columnTypes),
  }));

  const resultRows: Value[][] = rows.map((row) =>
    expandedItems.map((item) => evaluate(item.expr, row, ctx))
  );

  return { resultRows, columns };
}

function inferColumnName(expr: AST.Expression): string {
  switch (expr.kind) {
    case "column_ref": return expr.column;
    case "aggregate_call": return expr.arg ? `${expr.name}(${inferColumnName(expr.arg)})` : `${expr.name}(*)`;
    case "function_call": return `${expr.name}(${expr.args.map(inferColumnName).join(",")})`;
    case "number_literal": return String(expr.value);
    case "string_literal": return `'${expr.value}'`;
    case "window_call": return inferColumnName(expr.func);
    case "star_ref": return "*";
    case "cast_expr": return `CAST(${inferColumnName(expr.expr)} AS ${expr.targetType})`;
    default: return "?column?";
  }
}

/** Functions whose return value is a calendar date, not an instant. */
const DATE_RETURNING_FUNCTIONS = new Set(["CURRENT_DATE", "TO_DATE", "DATE_FROM_PARTS", "LAST_DAY"]);

/**
 * Functions that hand back one of their arguments unchanged, so the temporal
 * type has to travel through them: which arguments can supply it, and the
 * argument holding the DATEADD/DATE_TRUNC unit (a time unit downgrades a DATE
 * to a TIMESTAMP, as in Snowflake). Without this a DATE reached through
 * COALESCE would fall back to VARCHAR and print as a local-time timestamp
 * beside the same value printed as a calendar day.
 */
const TEMPORAL_PASSTHROUGH: Record<string, { values: number; unit?: number }> = {
  COALESCE: { values: 0 },
  NVL: { values: 0 },
  IFNULL: { values: 0 },
  GREATEST: { values: 0 },
  LEAST: { values: 0 },
  IFF: { values: 1 },
  DATE_TRUNC: { values: 1, unit: 0 },
  DATEADD: { values: 2, unit: 0 },
  TIMESTAMPADD: { values: 2, unit: 0 },
};

const TIME_UNITS = new Set(["hour", "hh", "minute", "mi", "n", "second", "ss", "s", "millisecond", "ms", "microsecond", "nanosecond", "ns"]);

/** First temporal type among `exprs`, if any. */
function firstTemporal(exprs: AST.Expression[], types?: Map<string, DataType>): DataType | undefined {
  for (const e of exprs) {
    const t = inferType(e, types);
    if (isTemporal(t)) return t;
  }
  return undefined;
}

/**
 * Column type reported for a projected expression.
 *
 * Only the date/time types are resolved from the source schema (`types`): they
 * are the ones that change how a value renders. Everything else keeps the
 * historical VARCHAR/NUMBER answer, which the table formatter uses purely for
 * column alignment.
 */
function inferType(expr: AST.Expression, types?: Map<string, DataType>): DataType {
  switch (expr.kind) {
    case "number_literal": return "NUMBER";
    case "string_literal": return "VARCHAR";
    case "boolean_literal": return "BOOLEAN";
    case "null_literal": return "VARCHAR";
    case "column_ref": {
      const key = (expr.table ? `${expr.table}.${expr.column}` : expr.column).toUpperCase();
      const declared = types?.get(key) ?? (expr.table ? types?.get(expr.column.toUpperCase()) : undefined);
      return isTemporal(declared) ? declared : "VARCHAR";
    }
    case "aggregate_call": {
      // MIN/MAX preserve their argument's type; the rest are numeric.
      if ((expr.name === "MIN" || expr.name === "MAX") && expr.arg) {
        const inner = inferType(expr.arg, types);
        if (isTemporal(inner)) return inner;
      }
      return "NUMBER";
    }
    case "function_call": {
      const name = expr.name.toUpperCase();
      if (DATE_RETURNING_FUNCTIONS.has(name)) return "DATE";
      const passthrough = TEMPORAL_PASSTHROUGH[name];
      if (passthrough) {
        const carried = firstTemporal(expr.args.slice(passthrough.values), types);
        if (!carried) return "VARCHAR";
        const unit = passthrough.unit != null ? expr.args[passthrough.unit] : undefined;
        const isTimeUnit = unit?.kind === "string_literal" && TIME_UNITS.has(unit.value.toLowerCase().replace(/s$/, ""));
        return isTimeUnit ? "TIMESTAMP" : carried;
      }
      return "VARCHAR";
    }
    case "cast_expr": {
      const t = expr.targetType.toUpperCase().replace(/\(.*\)/, "");
      if (t === "NUMBER" || t === "INT" || t === "INTEGER") return "NUMBER";
      if (t === "FLOAT" || t === "DOUBLE") return "FLOAT";
      if (t === "BOOLEAN") return "BOOLEAN";
      if (t === "DATE") return "DATE";
      if (t === "TIMESTAMP") return "TIMESTAMP";
      return "VARCHAR";
    }
    case "case_expr":
      return firstTemporal(
        [...expr.whenClauses.map((wc) => wc.then), ...(expr.elseClause ? [expr.elseClause] : [])],
        types,
      ) ?? "VARCHAR";
    default: return "VARCHAR";
  }
}

function isTemporal(t?: DataType): t is "DATE" | "TIMESTAMP" | "TIME" {
  return t === "DATE" || t === "TIMESTAMP" || t === "TIME";
}

function executeSetOp(type: string, left: ResultSet, right: ResultSet): QueryResult {
  const columns = left.columns;
  let rows: Value[][] = [];

  switch (type) {
    case "UNION ALL":
      rows = [...left.rows, ...right.rows];
      break;
    case "UNION": {
      const all = [...left.rows, ...right.rows];
      const seen = new Set<string>();
      rows = all.filter((r) => {
        const key = JSON.stringify(r);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      break;
    }
    case "INTERSECT": {
      const rightKeys = new Set(right.rows.map((r) => JSON.stringify(r)));
      rows = left.rows.filter((r) => rightKeys.has(JSON.stringify(r)));
      break;
    }
    case "EXCEPT": {
      const rightKeys = new Set(right.rows.map((r) => JSON.stringify(r)));
      rows = left.rows.filter((r) => !rightKeys.has(JSON.stringify(r)));
      break;
    }
  }

  return { type: "resultset", data: { columns, rows, rowCount: rows.length } };
}
