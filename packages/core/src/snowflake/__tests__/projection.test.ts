import { describe, it, expect } from "vitest";
import { SnowflakeState } from "../state";
import { formatResultSet } from "../formatter/table_formatter";
import { createTestContext, executeQuery, getResultSet, rows, columnValues, expectError, stripAnsi } from "./testHelpers";

/**
 * Regressions around what the select list *means*:
 *   - a subquery is consumed through its projection, not its source columns
 *   - ORDER BY may name a select-list alias or ordinal
 *   - a DATE column prints as a calendar day, with no viewer-timezone drift
 */

function createTestState(): SnowflakeState {
  return new SnowflakeState({
    databases: {
      NEXACORP_DB: {
        name: "NEXACORP_DB",
        schemas: {
          PUBLIC: {
            name: "PUBLIC",
            tables: {
              EMPLOYEES: {
                name: "EMPLOYEES",
                columns: [
                  { name: "ID", type: "NUMBER", nullable: false },
                  { name: "NAME", type: "VARCHAR", nullable: false },
                  { name: "DEPT", type: "VARCHAR", nullable: false },
                  { name: "SALARY", type: "NUMBER", nullable: false },
                  // Seed data parses ISO day strings, which land on UTC midnight.
                  { name: "HIRE_DATE", type: "DATE", nullable: false },
                  { name: "LAST_LOGIN", type: "TIMESTAMP", nullable: true },
                ],
                rows: [
                  { ID: 1, NAME: "Alice", DEPT: "Eng", SALARY: 90000, HIRE_DATE: new Date("2025-02-15"), LAST_LOGIN: new Date("2025-06-01T14:30:00Z") },
                  { ID: 2, NAME: "Bob", DEPT: "Sales", SALARY: 70000, HIRE_DATE: new Date("2024-11-01"), LAST_LOGIN: new Date("2025-06-02T09:05:00Z") },
                  { ID: 3, NAME: "Carol", DEPT: "Eng", SALARY: 120000, HIRE_DATE: new Date("2023-07-04"), LAST_LOGIN: null },
                ],
                createdAt: new Date("2026-02-03"),
              },
              // First column deliberately differs from the columns queried below,
              // so a subquery that leaks its source's first column is obvious.
              TICKETS: {
                name: "TICKETS",
                columns: [
                  { name: "TICKET_ID", type: "VARCHAR", nullable: false },
                  { name: "OWNER_ID", type: "NUMBER", nullable: false },
                  { name: "PRIORITY", type: "VARCHAR", nullable: false },
                ],
                rows: [
                  { TICKET_ID: "TK-1", OWNER_ID: 2, PRIORITY: "high" },
                  { TICKET_ID: "TK-2", OWNER_ID: 3, PRIORITY: "high" },
                  { TICKET_ID: "TK-3", OWNER_ID: 1, PRIORITY: "low" },
                ],
                createdAt: new Date("2026-02-03"),
              },
            },
            views: {
              // Views expose no declared columns, so their types have to come
              // back from executing the query.
              EMPLOYEE_DATES: {
                name: "EMPLOYEE_DATES",
                columns: [],
                query: "SELECT id, name, hire_date FROM employees",
              },
            },
            sequences: {},
            stages: {},
          },
        },
      },
    },
    warehouses: {},
  });
}

function run(sql: string) {
  return executeQuery(sql, createTestState());
}

/** East and west of UTC, plus the extremes, so any offset drift shows up. */
const TIMEZONES = ["UTC", "America/Chicago", "Asia/Tokyo", "Pacific/Kiritimati"];

/** Run `fn` as if the player's machine were in `tz`. */
function withTZ<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    // Assigning `undefined` back would set the literal string "undefined" and
    // pin every later test to GMT.
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
}

/** The formatted table for `sql`, as the player would read it in `tz`. */
function renderIn(tz: string, sql: string): string {
  return withTZ(tz, () => stripAnsi(formatResultSet(getResultSet(run(sql)))));
}

// ─── Subquery projection ──────────────────────────────────────────────

describe("Subqueries — consume the projected column", () => {
  it("IN (subquery) matches the subquery's select list, not the table's first column", () => {
    const r = run("SELECT name FROM employees WHERE id IN (SELECT owner_id FROM tickets WHERE priority = 'high') ORDER BY name");
    expect(columnValues(r, "NAME")).toEqual(["Bob", "Carol"]);
  });

  it("NOT IN (subquery) matches the subquery's select list", () => {
    const r = run("SELECT name FROM employees WHERE id NOT IN (SELECT owner_id FROM tickets WHERE priority = 'high') ORDER BY name");
    expect(columnValues(r, "NAME")).toEqual(["Alice"]);
  });

  it("IN (subquery) evaluates a computed select list", () => {
    const r = run("SELECT name FROM employees WHERE id IN (SELECT salary / 30000 FROM employees)");
    expect(columnValues(r, "NAME")).toEqual(["Carol"]);
  });

  it("scalar subquery returns its projected column", () => {
    const r = run("SELECT (SELECT name FROM employees WHERE id = 2) AS who");
    expect(columnValues(r, "WHO")).toEqual(["Bob"]);
  });

  it("scalar subquery over an aggregate still works", () => {
    const r = run("SELECT name FROM employees WHERE salary = (SELECT MAX(salary) FROM employees)");
    expect(columnValues(r, "NAME")).toEqual(["Carol"]);
  });

  it("correlated scalar subquery sees the outer row", () => {
    const r = run("SELECT name, (SELECT COUNT(*) FROM tickets t WHERE t.owner_id = e.id) AS n FROM employees e ORDER BY name");
    expect(rows(r)).toEqual([
      { NAME: "Alice", N: 1 },
      { NAME: "Bob", N: 1 },
      { NAME: "Carol", N: 1 },
    ]);
  });

  it("EXISTS still filters on row presence", () => {
    const r = run("SELECT name FROM employees e WHERE EXISTS (SELECT 1 FROM tickets t WHERE t.owner_id = e.id AND t.priority = 'high') ORDER BY name");
    expect(columnValues(r, "NAME")).toEqual(["Bob", "Carol"]);
  });

  it("rejects a multi-row scalar subquery like Snowflake does", () => {
    const r = run("SELECT name FROM employees WHERE salary > (SELECT salary FROM employees)");
    expectError(r, "Single-row subquery returns more than one row");
  });

  it("scalar subquery with no rows is NULL", () => {
    const r = run("SELECT (SELECT name FROM employees WHERE id = 99) AS who");
    expect(columnValues(r, "WHO")).toEqual([null]);
  });

  it("projects through a nested subquery", () => {
    const r = run(
      "SELECT name FROM employees WHERE id IN (SELECT owner_id FROM tickets WHERE ticket_id IN (SELECT ticket_id FROM tickets WHERE priority = 'high')) ORDER BY name",
    );
    expect(columnValues(r, "NAME")).toEqual(["Bob", "Carol"]);
  });

  it("threads the outer row into a correlated IN subquery", () => {
    const r = run(
      "SELECT name FROM employees e WHERE e.id IN (SELECT t.owner_id FROM tickets t WHERE t.priority = 'high' AND t.owner_id = e.id) ORDER BY name",
    );
    expect(columnValues(r, "NAME")).toEqual(["Bob", "Carol"]);
  });

  it("threads the outer row into both sides of a set operation", () => {
    expect(columnValues(run("SELECT name FROM employees e WHERE e.id IN (SELECT 99 UNION ALL SELECT e.id) ORDER BY name"), "NAME"))
      .toEqual(["Alice", "Bob", "Carol"]);
    expect(rows(run("SELECT name FROM employees e WHERE 98 IN (SELECT 99 UNION ALL SELECT e.id)"))).toEqual([]);
  });
});

// ─── ORDER BY resolution ──────────────────────────────────────────────

describe("ORDER BY — select-list aliases and ordinals", () => {
  it("sorts by a select-list alias ascending", () => {
    const r = run("SELECT name, salary AS pay FROM employees ORDER BY pay");
    expect(columnValues(r, "NAME")).toEqual(["Bob", "Alice", "Carol"]);
  });

  it("sorts by a select-list alias descending", () => {
    const r = run("SELECT name, salary AS pay FROM employees ORDER BY pay DESC");
    expect(columnValues(r, "NAME")).toEqual(["Carol", "Alice", "Bob"]);
  });

  it("sorts by an alias over a computed expression", () => {
    const r = run("SELECT name, salary / 1000 AS pay_k FROM employees ORDER BY pay_k DESC");
    expect(columnValues(r, "NAME")).toEqual(["Carol", "Alice", "Bob"]);
  });

  it("sorts by ordinal position", () => {
    const r = run("SELECT name, salary FROM employees ORDER BY 2");
    expect(columnValues(r, "NAME")).toEqual(["Bob", "Alice", "Carol"]);
  });

  it("sorts by multiple ordinals", () => {
    const r = run("SELECT dept, name FROM employees ORDER BY 1, 2 DESC");
    expect(columnValues(r, "NAME")).toEqual(["Carol", "Alice", "Bob"]);
  });

  it("still sorts by a real source column", () => {
    const r = run("SELECT name FROM employees ORDER BY salary DESC");
    expect(columnValues(r, "NAME")).toEqual(["Carol", "Alice", "Bob"]);
  });

  it("still sorts by a table-qualified source column", () => {
    const r = run("SELECT e.name FROM employees e ORDER BY e.hire_date");
    expect(columnValues(r, "NAME")).toEqual(["Carol", "Bob", "Alice"]);
  });

  it("prefers the select-list alias over a same-named source column", () => {
    const r = run("SELECT salary AS name FROM employees ORDER BY name");
    expect(columnValues(r, "NAME")).toEqual([70000, 90000, 120000]);
  });

  // Groups come out in encounter order (Eng, then Sales), so each of these
  // asserts an order the unsorted result would not produce.
  it("sorts an aggregate query by alias", () => {
    const r = run("SELECT dept, SUM(salary) AS total FROM employees GROUP BY dept ORDER BY total");
    expect(rows(r)).toEqual([
      { DEPT: "Sales", TOTAL: 70000 },
      { DEPT: "Eng", TOTAL: 210000 },
    ]);
  });

  it("sorts an aggregate query by ordinal", () => {
    const r = run("SELECT dept, COUNT(*) AS n FROM employees GROUP BY dept ORDER BY 2");
    expect(rows(r)).toEqual([
      { DEPT: "Sales", N: 1 },
      { DEPT: "Eng", N: 2 },
    ]);
  });

  it("sorts an aggregate query descending by a DATE alias", () => {
    const r = run("SELECT dept, MIN(hire_date) AS first_hire FROM employees GROUP BY dept ORDER BY first_hire DESC");
    expect(columnValues(r, "DEPT")).toEqual(["Sales", "Eng"]);
  });

  it("resolves an alias used inside a larger ORDER BY expression", () => {
    const r = run("SELECT name, salary AS pay FROM employees ORDER BY ABS(pay) DESC");
    expect(columnValues(r, "NAME")).toEqual(["Carol", "Alice", "Bob"]);
  });

  it("resolves an alias inside an arithmetic ORDER BY expression", () => {
    const r = run("SELECT name, salary AS pay FROM employees ORDER BY pay * -1");
    expect(columnValues(r, "NAME")).toEqual(["Carol", "Alice", "Bob"]);
  });

  it("resolves an aggregate alias inside an ORDER BY expression", () => {
    const r = run("SELECT dept, SUM(salary) AS total FROM employees GROUP BY dept ORDER BY total / 1000");
    expect(columnValues(r, "DEPT")).toEqual(["Sales", "Eng"]);
  });

  it("sorts SELECT * by ordinal, counting the expanded star", () => {
    const r = run("SELECT * FROM employees ORDER BY 4 DESC");
    expect(columnValues(r, "NAME")).toEqual(["Carol", "Alice", "Bob"]);
  });

  it("rejects an ordinal outside the select list", () => {
    expectError(run("SELECT name FROM employees ORDER BY 3"), "ORDER BY position 3 is not in select list");
  });

  it("rejects a negative or fractional ordinal", () => {
    expectError(run("SELECT name, dept FROM employees ORDER BY -1"), "ORDER BY position -1 is not in select list");
    expectError(run("SELECT name, dept FROM employees ORDER BY 1.5"), "ORDER BY position 1.5 is not in select list");
  });

  it("polices SELECT * ordinals the same way on an empty result", () => {
    expectError(run("SELECT * FROM employees WHERE id = 99 ORDER BY 99"), "ORDER BY position 99 is not in select list");
    expect(rows(run("SELECT * FROM employees WHERE id = 99 ORDER BY 4"))).toEqual([]);
  });
});

// ─── DATE rendering ───────────────────────────────────────────────────

describe("DATE rendering — calendar day, no timezone drift", () => {
  it("types a DATE column as DATE and a TIMESTAMP column as TIMESTAMP", () => {
    const rs = getResultSet(run("SELECT hire_date, last_login, name FROM employees"));
    expect(rs.columns.map((c) => c.type)).toEqual(["DATE", "TIMESTAMP", "VARCHAR"]);
  });

  it("renders a DATE date-only in any viewer timezone", () => {
    for (const tz of TIMEZONES) {
      const plain = renderIn(tz, "SELECT name, hire_date FROM employees ORDER BY name");
      expect(plain, tz).toContain("2025-02-15");
      expect(plain, tz).toContain("2024-11-01");
      expect(plain, tz).toContain("2023-07-04");
      expect(plain, tz).not.toContain("00:00:00");
    }
  });

  it("shows one row's DATE as one calendar day however it is reached", () => {
    const sql = `SELECT hire_date,
        COALESCE(end_date, hire_date) AS via_coalesce,
        DATE_TRUNC('day', hire_date) AS via_trunc,
        GREATEST(hire_date, hire_date) AS via_greatest,
        CASE WHEN id = 1 THEN hire_date ELSE end_date END AS via_case,
        DATEADD('day', 0, hire_date) AS via_dateadd
      FROM employees WHERE id = 1`;
    for (const tz of TIMEZONES) {
      const plain = renderIn(tz, sql);
      const cells = plain.split("\n")[3].split("|").slice(1, -1).map((c) => c.trim());
      expect(cells, tz).toEqual(Array(6).fill("2025-02-15"));
    }
  });

  it("types DATE through views and derived tables", () => {
    expect(getResultSet(run("SELECT hire_date FROM employee_dates")).columns[0].type).toBe("DATE");
    expect(getResultSet(run("SELECT v.hire_date FROM employee_dates v")).columns[0].type).toBe("DATE");
    expect(getResultSet(run("SELECT hire_date FROM (SELECT * FROM employees) d")).columns[0].type).toBe("DATE");
    expect(getResultSet(run("WITH e AS (SELECT hire_date FROM employees) SELECT hire_date FROM e")).columns[0].type).toBe("DATE");
    expect(renderIn("Asia/Tokyo", "SELECT hire_date FROM employee_dates WHERE id = 1")).toContain("2025-02-15");
  });

  it("types DATE_FROM_PARTS and LAST_DAY as DATE", () => {
    const plain = renderIn("America/Chicago", "SELECT DATE_FROM_PARTS(2026, 3, 1) AS a, LAST_DAY(TO_DATE('2026-03-05')) AS b");
    expect(plain).toContain("2026-03-01");
    expect(plain).toContain("2026-03-31");
    expect(plain).not.toContain("00:00:00");
  });

  it("keeps a time-unit DATEADD a timestamp", () => {
    const rs = getResultSet(run("SELECT DATEADD('hour', 6, hire_date) AS h FROM employees WHERE id = 1"));
    expect(rs.columns[0].type).toBe("TIMESTAMP");
  });

  it("renders CURRENT_DATE()/TO_DATE() date-only", () => {
    const plain = withTZ("Asia/Tokyo", () =>
      stripAnsi(formatResultSet(getResultSet(executeQuery(
        "SELECT CURRENT_DATE() AS today, TO_DATE('2026-03-01') AS d",
        createTestState(),
        createTestContext({ gameNow: new Date("2026-02-24T15:00:00Z") }),
      ))))
    );
    expect(plain).toContain("2026-02-25");
    expect(plain).toContain("2026-03-01");
    expect(plain).not.toContain("00:00:00");
  });

  it("keeps TIMESTAMP columns rendering with their time of day", () => {
    const plain = withTZ("UTC", () =>
      stripAnsi(formatResultSet(getResultSet(run("SELECT name, last_login FROM employees ORDER BY name"))))
    );
    expect(plain).toContain("2025-06-01 14:30:00");
    expect(plain).toContain("2025-06-02 09:05:00");
  });

  it("keeps DATE values as Date objects in the result data", () => {
    const rs = getResultSet(run("SELECT hire_date FROM employees WHERE id = 1"));
    expect(rs.rows[0][0]).toBeInstanceOf(Date);
  });
});

// ─── MIN/MAX ordering ─────────────────────────────────────────────────

describe("MIN/MAX — ordered by value, not by stringified Date", () => {
  it("picks the real earliest and latest DATE in any timezone", () => {
    for (const tz of TIMEZONES) {
      // Stringifying would order these by weekday name: Fri < Sat < Tue.
      const plain = renderIn(tz, "SELECT MIN(hire_date) AS lo, MAX(hire_date) AS hi FROM employees");
      expect(plain, tz).toContain("2023-07-04");
      expect(plain, tz).toContain("2025-02-15");
      expect(plain, tz).not.toContain("2024-11-01");
    }
  });

  it("reports MIN/MAX over a DATE column as DATE", () => {
    const rs = getResultSet(run("SELECT MIN(hire_date) AS lo, MAX(last_login) AS hi FROM employees"));
    expect(rs.columns.map((c) => c.type)).toEqual(["DATE", "TIMESTAMP"]);
  });

  it("leaves MIN/MAX over numbers and strings unchanged", () => {
    expect(rows(run("SELECT MIN(salary) AS lo, MAX(salary) AS hi, MIN(name) AS first, MAX(name) AS last FROM employees")))
      .toEqual([{ LO: 70000, HI: 120000, FIRST: "Alice", LAST: "Carol" }]);
  });

  it("GREATEST/LEAST return the winning argument, not a coerced number", () => {
    expect(rows(run("SELECT LEAST(9, 2, 5) AS n, GREATEST('a', 'c', 'b') AS s FROM employees WHERE id = 1")))
      .toEqual([{ N: 2, S: "c" }]);
  });
});
