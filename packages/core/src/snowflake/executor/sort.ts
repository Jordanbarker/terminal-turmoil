import { Row, Value } from "../types";
import { OrderByItem } from "../parser/ast";
import { evaluate, compareValues, EvalContext } from "./evaluator";

/**
 * Sort keys are evaluated once per row up front (a Schwartzian transform)
 * rather than inside the comparator, which would re-evaluate them ~2n·log n
 * times. ORDER BY terms can be whole expressions, and since alias resolution
 * they can be aggregate or subquery expressions too, so that is not just a
 * constant factor.
 */
export function sortRows(rows: Row[], orderBy: OrderByItem[], ctx: EvalContext): Row[] {
  const keyed = rows.map((row) => ({
    row,
    keys: orderBy.map((item) => evaluate(item.expr, row, ctx)),
  }));

  keyed.sort((a, b) => {
    for (let i = 0; i < orderBy.length; i++) {
      const item = orderBy[i];
      const va: Value = a.keys[i];
      const vb: Value = b.keys[i];

      // Handle NULLS FIRST/LAST
      if (va === null && vb === null) continue;
      if (va === null) {
        if (item.nulls === "FIRST") return -1;
        if (item.nulls === "LAST") return 1;
        return item.direction === "ASC" ? 1 : -1; // default: NULLS LAST for ASC, FIRST for DESC
      }
      if (vb === null) {
        if (item.nulls === "FIRST") return 1;
        if (item.nulls === "LAST") return -1;
        return item.direction === "ASC" ? -1 : 1;
      }

      const cmp = compareValues(va, vb);
      if (cmp !== 0) return item.direction === "DESC" ? -cmp : cmp;
    }
    return 0;
  });

  return keyed.map((k) => k.row);
}
