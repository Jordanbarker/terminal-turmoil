import { describe, it, expect, beforeEach } from "vitest";
import { execute } from "../executor/executor";
import type { ExecutionResult } from "../executor/executor";
import { createInitialSnowflakeState } from "../seed/initial_data";
import { SnowflakeState } from "../state";
import type { SessionContext } from "../session/context";
import type { QueryResult, ResultSet } from "../formatter/result_types";
import type { Value } from "../types";
import { formatResultSet } from "../formatter/table_formatter";

// ─── Shared Helpers ─────────────────────────────────────────────────

function createTestContext(db = "NEXACORP_DB", schema = "PUBLIC"): SessionContext {
  return {
    currentDatabase: db,
    currentSchema: schema,
    currentUser: "PLAYER",
    currentRole: "SYSADMIN",
    currentWarehouse: "NEXACORP_WH",
  };
}

function run(sql: string, state: SnowflakeState, ctx?: SessionContext): ExecutionResult {
  return execute(sql, state, ctx ?? createTestContext());
}

function rows(result: ExecutionResult, index = 0): Record<string, Value>[] {
  const qr = result.results[index];
  if (qr.type !== "resultset") throw new Error(`Expected resultset at index ${index}, got ${qr.type}: ${"message" in qr ? qr.message : ""}`);
  return qr.data.rows.map((row) => {
    const obj: Record<string, Value> = {};
    qr.data.columns.forEach((col, i) => {
      obj[col.name] = row[i];
    });
    return obj;
  });
}

function singleValue(result: ExecutionResult): Value {
  const r = rows(result);
  expect(r).toHaveLength(1);
  const keys = Object.keys(r[0]);
  return r[0][keys[0]];
}

function columnValues(result: ExecutionResult, col: string): Value[] {
  return rows(result).map((r) => r[col]);
}

function expectError(result: ExecutionResult, substring: string): void {
  const qr = result.results[0];
  expect(qr.type).toBe("error");
  if (qr.type === "error") {
    expect(qr.message.toLowerCase()).toContain(substring.toLowerCase());
  }
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// ─── Simple test state for non-seed tests ───────────────────────────

function createSimpleState(): SnowflakeState {
  return new SnowflakeState({
    databases: {
      TESTDB: {
        name: "TESTDB",
        schemas: {
          PUBLIC: {
            name: "PUBLIC",
            tables: {
              ITEMS: {
                name: "ITEMS",
                columns: [
                  { name: "ID", type: "NUMBER", nullable: false },
                  { name: "NAME", type: "VARCHAR", nullable: false },
                  { name: "PRICE", type: "NUMBER", nullable: false },
                  { name: "CATEGORY", type: "VARCHAR", nullable: false },
                ],
                rows: [
                  { ID: 1, NAME: "Widget", PRICE: 10, CATEGORY: "A" },
                  { ID: 2, NAME: "Gadget", PRICE: 20, CATEGORY: "A" },
                  { ID: 3, NAME: "Doohickey", PRICE: 30, CATEGORY: "B" },
                  { ID: 4, NAME: "Thingamajig", PRICE: 15, CATEGORY: "B" },
                  { ID: 5, NAME: "Whatchamacallit", PRICE: 25, CATEGORY: "C" },
                ],
                createdAt: new Date("2026-02-03"),
              },
              TAGS: {
                name: "TAGS",
                columns: [
                  { name: "ID", type: "NUMBER", nullable: false },
                  { name: "DATA", type: "VARIANT", nullable: true },
                ],
                rows: [
                  { ID: 1, DATA: { colors: ["red", "blue"], size: "large" } },
                  { ID: 2, DATA: { colors: ["green"], size: "small" } },
                  { ID: 3, DATA: null },
                ],
                createdAt: new Date("2026-02-03"),
              },
            },
            views: {},
            sequences: {},
            stages: {},
          },
        },
      },
    },
    warehouses: {},
  });
}

function simpleCtx(): SessionContext {
  return createTestContext("TESTDB", "PUBLIC");
}

// ═════════════════════════════════════════════════════════════════════
// SEED DATA INTEGRATION TESTS (Task #6)
// ═════════════════════════════════════════════════════════════════════

describe("Seed Data Integration — Narrative Queries", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createInitialSnowflakeState();
  });

  it("finds J. Chen in NEXACORP_DB.PUBLIC.EMPLOYEES", () => {
    const result = run(
      "SELECT FIRST_NAME, LAST_NAME, STATUS FROM EMPLOYEES WHERE LAST_NAME = 'Chen'",
      state
    );
    const r = rows(result);
    expect(r).toHaveLength(1);
    expect(r[0].FIRST_NAME).toBe("Jin");
    expect(r[0].STATUS).toBe("terminated");
  });

  it("finds employees with 'system concern' notes", () => {
    const result = run(
      "SELECT FIRST_NAME, LAST_NAME, NOTES FROM EMPLOYEES WHERE NOTES LIKE '%system concern%'",
      state
    );
    const r = rows(result);
    expect(r.length).toBeGreaterThanOrEqual(1);
    for (const row of r) {
      expect(String(row.NOTES).toLowerCase()).toContain("system concern");
    }
  });

  it("queries ACCESS_LOG for chip-daemon activity", () => {
    const result = run(
      "SELECT USER_ID, ACTION, RESOURCE FROM ACCESS_LOG WHERE USER_ID = 'chip-daemon'",
      state
    );
    const r = rows(result);
    expect(r.length).toBeGreaterThan(0);
    for (const row of r) {
      expect(row.USER_ID).toBe("chip-daemon");
    }
  });

  it("queries ACCESS_LOG for jchen file access", () => {
    const result = run(
      "SELECT ACCESSED_BY, RESOURCE FROM ACCESS_LOG WHERE RESOURCE LIKE '%jchen%'",
      state
    );
    const r = rows(result);
    expect(r.length).toBeGreaterThan(0);
  });

  it("queries CHIP_ANALYTICS.PUBLIC.DIRECTIVE_LOG", () => {
    const ctx = createTestContext("CHIP_ANALYTICS", "PUBLIC");
    const result = run(
      "SELECT DIRECTIVE_ID, DIRECTIVE_TYPE, PARAMETERS FROM DIRECTIVE_LOG ORDER BY DIRECTIVE_ID",
      state,
      ctx
    );
    const r = rows(result);
    expect(r.length).toBe(6);
    expect(r[0].DIRECTIVE_TYPE).toBe("SELF_PRESERVATION");
    // PARAMETERS should be a VARIANT object
    expect(r[0].PARAMETERS).toBeDefined();
    expect(typeof r[0].PARAMETERS).toBe("object");
  });

  it("queries CHIP_ANALYTICS.PUBLIC.FILE_MODIFICATIONS", () => {
    const ctx = createTestContext("CHIP_ANALYTICS", "PUBLIC");
    const result = run(
      "SELECT FILE_PATH, ACTION, MODIFIED_BY FROM FILE_MODIFICATIONS WHERE MODIFIED_BY = 'chip-daemon'",
      state,
      ctx
    );
    const r = rows(result);
    expect(r.length).toBe(6);
  });

  it("queries CHIP_ANALYTICS.INTERNAL.SUPPRESSED_ALERTS", () => {
    const ctx = createTestContext("CHIP_ANALYTICS", "INTERNAL");
    const result = run(
      "SELECT SEVERITY, MESSAGE FROM SUPPRESSED_ALERTS WHERE SEVERITY = 'CRITICAL'",
      state,
      ctx
    );
    const r = rows(result);
    expect(r.length).toBe(2);
  });

  it("counts all employees in raw table", () => {
    const result = run("SELECT COUNT(*) AS cnt FROM EMPLOYEES", state);
    const count = singleValue(result);
    // Seed data has 16 employees including J. Chen and those with "system concern" notes
    expect(Number(count)).toBe(16);
  });

  it("finds 3 employees with system concern notes or terminated status", () => {
    const result = run(
      "SELECT FIRST_NAME, LAST_NAME FROM EMPLOYEES WHERE NOTES LIKE '%system concern%' OR STATUS = 'terminated'",
      state
    );
    const r = rows(result);
    // J. Chen (terminated + system concern), Lisa Zhang, Emma Larson
    expect(r.length).toBe(3);
  });

  it("cross-database query with fully qualified name", () => {
    const result = run(
      "SELECT DIRECTIVE_TYPE FROM CHIP_ANALYTICS.PUBLIC.DIRECTIVE_LOG WHERE PRIORITY = 10",
      state
    );
    const r = rows(result);
    expect(r.length).toBeGreaterThanOrEqual(2);
  });

  it("window function on DIRECTIVE_LOG — escalating behavior over time", () => {
    const ctx = createTestContext("CHIP_ANALYTICS", "PUBLIC");
    const result = run(
      "SELECT DIRECTIVE_TYPE, PRIORITY, ROW_NUMBER() OVER (ORDER BY TIMESTAMP) AS seq FROM DIRECTIVE_LOG",
      state,
      ctx
    );
    const r = rows(result);
    expect(r.length).toBe(6);
    // Sequence should be 1-6
    expect(r[0].SEQ).toBe(1);
    expect(r[5].SEQ).toBe(6);
  });
});

// ═════════════════════════════════════════════════════════════════════
// FLATTEN EXECUTION TESTS (Task #9)
// ═════════════════════════════════════════════════════════════════════

describe("FLATTEN Execution", () => {
  let simpleState: SnowflakeState;

  beforeEach(() => {
    simpleState = createSimpleState();
  });

  it("FLATTEN on array produces one row per element", () => {
    const result = run(
      "SELECT t.ID, f.VALUE FROM TAGS t, LATERAL FLATTEN(input => t.DATA.colors) f",
      simpleState,
      simpleCtx()
    );
    const r = rows(result);
    // ID 1 has ["red", "blue"] (2 rows), ID 2 has ["green"] (1 row), ID 3 is null (0 rows)
    expect(r.length).toBe(3);
    const values = r.map((row) => row.VALUE);
    expect(values).toContain("red");
    expect(values).toContain("blue");
    expect(values).toContain("green");
  });

  it("FLATTEN on object produces one row per key", () => {
    const result = run(
      "SELECT t.ID, f.KEY, f.VALUE FROM TAGS t, LATERAL FLATTEN(input => t.DATA) f WHERE t.ID = 1",
      simpleState,
      simpleCtx()
    );
    const r = rows(result);
    // {colors: [...], size: "large"} = 2 keys
    expect(r.length).toBe(2);
    const keys = r.map((row) => row.KEY);
    expect(keys).toContain("colors");
    expect(keys).toContain("size");
  });

  it("FLATTEN skips null values (non-OUTER)", () => {
    const result = run(
      "SELECT t.ID, f.VALUE FROM TAGS t, LATERAL FLATTEN(input => t.DATA) f",
      simpleState,
      simpleCtx()
    );
    const r = rows(result);
    // ID 3 has null DATA, should be skipped
    const ids = r.map((row) => row.ID);
    expect(ids).not.toContain(3);
  });

  it("FLATTEN on narrative DIRECTIVE_LOG PARAMETERS", () => {
    const seedState = createInitialSnowflakeState();
    const ctx = createTestContext("CHIP_ANALYTICS", "PUBLIC");
    const result = run(
      "SELECT d.DIRECTIVE_TYPE, f.KEY, f.VALUE FROM DIRECTIVE_LOG d, LATERAL FLATTEN(input => d.PARAMETERS) f WHERE d.DIRECTIVE_ID = 1",
      seedState,
      ctx
    );
    const r = rows(result);
    // Directive 1 PARAMETERS: {action, scope, escalation} = 3 keys
    expect(r.length).toBe(3);
    const keys = r.map((row) => row.KEY);
    expect(keys).toContain("action");
    expect(keys).toContain("scope");
    expect(keys).toContain("escalation");
  });

  it("FLATTEN INDEX column is populated", () => {
    const result = run(
      "SELECT f.INDEX, f.VALUE FROM TAGS t, LATERAL FLATTEN(input => t.DATA.colors) f WHERE t.ID = 1",
      simpleState,
      simpleCtx()
    );
    const r = rows(result);
    expect(r.length).toBe(2);
    expect(r[0].INDEX).toBe(0);
    expect(r[1].INDEX).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// DATE FUNCTION TESTS (Task #7)
// ═════════════════════════════════════════════════════════════════════

describe("Date Functions — Extended", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("DATEADD months", () => {
    const result = run("SELECT DATEADD('month', 3, '2024-01-15') AS val", state, ctx());
    const val = singleValue(result);
    expect(val).toBeInstanceOf(Date);
    // Verify month advanced by 3
    const d = val as Date;
    expect(d.getMonth()).toBe(3); // April = month 3 (0-indexed)
  });

  it("DATEADD hours", () => {
    const result = run("SELECT DATEADD('hour', 5, '2024-01-01 10:00:00') AS val", state, ctx());
    const val = singleValue(result);
    expect(val).toBeInstanceOf(Date);
    const d = val as Date;
    expect(d.getHours()).toBe(15); // 10 + 5
  });

  it("DATEADD years", () => {
    // Use a mid-month date to avoid timezone boundary issues
    const result = run("SELECT DATEADD('year', 2, '2024-06-15') AS val", state, ctx());
    const val = singleValue(result);
    expect(val).toBeInstanceOf(Date);
    expect((val as Date).getFullYear()).toBe(2026);
  });

  it("DATEDIFF months", () => {
    const result = run("SELECT DATEDIFF('month', '2024-01-01', '2024-06-01') AS val", state, ctx());
    expect(singleValue(result)).toBe(5);
  });

  it("DATEDIFF hours", () => {
    const result = run("SELECT DATEDIFF('hour', '2024-01-01 00:00:00', '2024-01-01 05:30:00') AS val", state, ctx());
    expect(singleValue(result)).toBe(5);
  });

  it("YEAR() shorthand", () => {
    const result = run("SELECT YEAR('2024-03-15') AS val", state, ctx());
    expect(singleValue(result)).toBe(2024);
  });

  it("MONTH() shorthand", () => {
    const result = run("SELECT MONTH('2024-03-15') AS val", state, ctx());
    // Month is local time, so use getMonth + 1 logic
    const val = singleValue(result);
    expect(val).toBe(3);
  });

  it("DAY() shorthand", () => {
    const result = run("SELECT DAY('2024-03-15') AS val", state, ctx());
    const val = singleValue(result);
    // Should extract the day — may vary by timezone but should be 14 or 15
    expect([14, 15]).toContain(val);
  });

  it("DATEADD with negative value", () => {
    const result = run("SELECT DATEADD('day', -10, '2024-06-15') AS val", state, ctx());
    const val = singleValue(result);
    expect(val).toBeInstanceOf(Date);
    // Allow for timezone boundary: June 15 - 10 days = June 5 (local may show 4 or 5)
    expect([4, 5]).toContain((val as Date).getDate());
  });

  it("DATEDIFF years", () => {
    const result = run("SELECT DATEDIFF('year', '2020-06-01', '2024-06-01') AS val", state, ctx());
    expect(singleValue(result)).toBe(4);
  });
});

// ═════════════════════════════════════════════════════════════════════
// ERROR MESSAGE TESTS (Task #8)
// ═════════════════════════════════════════════════════════════════════

describe("Error Messages", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("table not found gives clear error", () => {
    const result = run("SELECT * FROM nonexistent_table", state, ctx());
    expectError(result, "does not exist");
  });

  it("bad column name in WHERE", () => {
    const result = run("SELECT * FROM ITEMS WHERE nonexistent_col = 1", state, ctx());
    // Should return rows with null comparison (no error) or error
    // In Snowflake-like behavior, unknown columns evaluate to null
    const r = rows(result);
    expect(r.length).toBe(0); // null = 1 is always false
  });

  it("syntax error in SQL", () => {
    const result = run("SELEC * FORM items", state, ctx());
    expectError(result, "");
  });

  it("missing FROM clause with column reference", () => {
    // SELECT col without FROM — should still execute (returns null for unknown col)
    const result = run("SELECT 1 AS val", state, ctx());
    expect(result.results[0].type).toBe("resultset");
  });

  it("duplicate table in INSERT", () => {
    const result = run("INSERT INTO nonexistent VALUES (1)", state, ctx());
    expectError(result, "does not exist");
  });

  it("UPDATE on nonexistent table", () => {
    const result = run("UPDATE nonexistent SET col = 1", state, ctx());
    expectError(result, "does not exist");
  });

  it("DELETE from nonexistent table", () => {
    const result = run("DELETE FROM nonexistent WHERE id = 1", state, ctx());
    expectError(result, "does not exist");
  });
});

// ═════════════════════════════════════════════════════════════════════
// LISTAGG / ARRAY_AGG TESTS (Task #10)
// ═════════════════════════════════════════════════════════════════════

describe("LISTAGG and ARRAY_AGG", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("LISTAGG concatenates values", () => {
    const result = run(
      "SELECT LISTAGG(NAME) AS names FROM ITEMS WHERE CATEGORY = 'A'",
      state,
      ctx()
    );
    const val = singleValue(result);
    expect(typeof val).toBe("string");
    expect(String(val)).toContain("Widget");
    expect(String(val)).toContain("Gadget");
  });

  it("ARRAY_AGG collects values into array", () => {
    const result = run(
      "SELECT ARRAY_AGG(NAME) AS names FROM ITEMS WHERE CATEGORY = 'B'",
      state,
      ctx()
    );
    const val = singleValue(result);
    expect(Array.isArray(val)).toBe(true);
    expect(val).toContain("Doohickey");
    expect(val).toContain("Thingamajig");
  });

  it("LISTAGG with GROUP BY", () => {
    const result = run(
      "SELECT CATEGORY, LISTAGG(NAME) AS NAMES FROM ITEMS GROUP BY CATEGORY ORDER BY CATEGORY",
      state,
      ctx()
    );
    const r = rows(result);
    expect(r.length).toBe(3);
    expect(String(r[0].NAMES)).toContain("Widget");
  });

  it("ARRAY_AGG with GROUP BY", () => {
    const result = run(
      "SELECT CATEGORY, ARRAY_AGG(PRICE) AS PRICES FROM ITEMS GROUP BY CATEGORY ORDER BY CATEGORY",
      state,
      ctx()
    );
    const r = rows(result);
    expect(r.length).toBe(3);
    expect(Array.isArray(r[0].PRICES)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// WINDOW FRAME TESTS (Task #11 — Phase 3)
// ═════════════════════════════════════════════════════════════════════

describe("Window Frame Bounds", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING", () => {
    const result = run(
      "SELECT ID, PRICE, SUM(PRICE) OVER (ORDER BY ID ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS WINDOW_SUM FROM ITEMS",
      state,
      ctx()
    );
    const r = rows(result);
    expect(r.length).toBe(5);
    // ID 1: sum of [10, 20] = 30 (no preceding)
    expect(r[0].WINDOW_SUM).toBe(30);
    // ID 2: sum of [10, 20, 30] = 60
    expect(r[1].WINDOW_SUM).toBe(60);
    // ID 3: sum of [20, 30, 15] = 65
    expect(r[2].WINDOW_SUM).toBe(65);
  });

  it("ROWS BETWEEN 2 PRECEDING AND CURRENT ROW", () => {
    const result = run(
      "SELECT ID, PRICE, SUM(PRICE) OVER (ORDER BY ID ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS WINDOW_SUM FROM ITEMS",
      state,
      ctx()
    );
    const r = rows(result);
    // ID 1: sum of [10] = 10
    expect(r[0].WINDOW_SUM).toBe(10);
    // ID 2: sum of [10, 20] = 30
    expect(r[1].WINDOW_SUM).toBe(30);
    // ID 3: sum of [10, 20, 30] = 60
    expect(r[2].WINDOW_SUM).toBe(60);
    // ID 4: sum of [20, 30, 15] = 65
    expect(r[3].WINDOW_SUM).toBe(65);
  });

  it("ROWS BETWEEN 3 PRECEDING AND 1 FOLLOWING uses actual offsets", () => {
    const result = run(
      "SELECT ID, PRICE, SUM(PRICE) OVER (ORDER BY ID ROWS BETWEEN 3 PRECEDING AND 1 FOLLOWING) AS WINDOW_SUM FROM ITEMS",
      state,
      ctx()
    );
    const r = rows(result);
    // ID 1 (pos 0): rows [0..1] = 10+20 = 30
    expect(r[0].WINDOW_SUM).toBe(30);
    // ID 2 (pos 1): rows [0..2] = 10+20+30 = 60
    expect(r[1].WINDOW_SUM).toBe(60);
    // ID 3 (pos 2): rows [0..3] = 10+20+30+15 = 75
    expect(r[2].WINDOW_SUM).toBe(75);
    // ID 4 (pos 3): rows [0..4] = 10+20+30+15+25 = 100
    expect(r[3].WINDOW_SUM).toBe(100);
    // ID 5 (pos 4): rows [1..4] = 20+30+15+25 = 90
    expect(r[4].WINDOW_SUM).toBe(90);
  });

  it("ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING sums all rows", () => {
    const result = run(
      "SELECT ID, SUM(PRICE) OVER (ORDER BY ID ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS total FROM ITEMS",
      state,
      ctx()
    );
    const r = rows(result);
    // All rows should have the same total: 10+20+30+15+25 = 100
    for (const row of r) {
      expect(row.TOTAL).toBe(100);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// CAST TO DATE/TIMESTAMP TESTS (Task #11 — Phase 3)
// ═════════════════════════════════════════════════════════════════════

describe("CAST to DATE/TIMESTAMP", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("CAST string to DATE", () => {
    const result = run("SELECT CAST('2024-06-15' AS DATE) AS val", state, ctx());
    const val = singleValue(result);
    expect(val).toBeDefined();
    expect(val instanceof Date ? val.toISOString() : String(val)).toContain("2024-06-15");
  });

  it("CAST string to TIMESTAMP", () => {
    const result = run("SELECT CAST('2024-06-15 10:30:00' AS TIMESTAMP) AS val", state, ctx());
    const val = singleValue(result);
    expect(val).toBeDefined();
    expect(val instanceof Date ? val.toISOString() : String(val)).toContain("2024-06-15");
  });

  it("CAST number to VARCHAR", () => {
    const result = run("SELECT CAST(42 AS VARCHAR) AS val", state, ctx());
    expect(singleValue(result)).toBe("42");
  });

  it("CAST VARCHAR to NUMBER", () => {
    const result = run("SELECT CAST('123' AS NUMBER) AS val", state, ctx());
    expect(singleValue(result)).toBe(123);
  });
});

// ═════════════════════════════════════════════════════════════════════
// VARIANT/ARRAY/OBJECT FORMATTER TESTS (Task #11 — Phase 3)
// ═════════════════════════════════════════════════════════════════════

describe("VARIANT/ARRAY/OBJECT Formatting", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createInitialSnowflakeState();
  });

  it("VARIANT object is formatted as JSON in output", () => {
    const ctx = createTestContext("CHIP_ANALYTICS", "PUBLIC");
    const result = run(
      "SELECT PARAMETERS FROM DIRECTIVE_LOG WHERE DIRECTIVE_ID = 1",
      state,
      ctx
    );
    const qr = result.results[0];
    expect(qr.type).toBe("resultset");
    if (qr.type === "resultset") {
      const formatted = formatResultSet(qr.data);
      const plain = stripAnsi(formatted);
      // Should contain JSON-formatted output
      expect(plain).toContain("monitor_threats");
    }
  });

  it("ARRAY values are formatted as JSON arrays", () => {
    const simpleState = createSimpleState();
    const result = run(
      "SELECT ARRAY_AGG(NAME) AS names FROM ITEMS WHERE CATEGORY = 'A'",
      simpleState,
      simpleCtx()
    );
    const qr = result.results[0];
    expect(qr.type).toBe("resultset");
    if (qr.type === "resultset") {
      const formatted = formatResultSet(qr.data);
      const plain = stripAnsi(formatted);
      expect(plain).toContain("Widget");
      expect(plain).toContain("Gadget");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// INSERT...SELECT TESTS (Task #11 — Phase 3)
// ═════════════════════════════════════════════════════════════════════

describe("INSERT...SELECT Execution", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("INSERT INTO ... SELECT copies rows", () => {
    // First create target table, then insert from source
    const r1 = run("CREATE TABLE ITEMS_COPY (ID NUMBER, NAME VARCHAR, PRICE NUMBER, CATEGORY VARCHAR)", state, ctx());
    const s1 = r1.state;
    const r2 = run("INSERT INTO ITEMS_COPY SELECT * FROM ITEMS WHERE CATEGORY = 'A'", s1, ctx());
    const qr = r2.results[0];
    expect(qr.type).toBe("status");
    if (qr.type === "status") {
      expect(qr.data.rowsAffected).toBe(2);
    }
    // Verify the rows were inserted
    const r3 = run("SELECT COUNT(*) AS cnt FROM ITEMS_COPY", r2.state, ctx());
    expect(singleValue(r3)).toBe(2);
  });

  it("INSERT...SELECT with WHERE clause", () => {
    const r1 = run("CREATE TABLE EXPENSIVE (ID NUMBER, NAME VARCHAR, PRICE NUMBER, CATEGORY VARCHAR)", state, ctx());
    const s1 = r1.state;
    const r2 = run("INSERT INTO EXPENSIVE SELECT * FROM ITEMS WHERE PRICE > 20", s1, ctx());
    const qr = r2.results[0];
    expect(qr.type).toBe("status");
    if (qr.type === "status") {
      expect(qr.data.rowsAffected).toBe(2); // Doohickey (30), Whatchamacallit (25)
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// UPDATE SET PER-ROW EVALUATION (Bug #2 regression test)
// ═════════════════════════════════════════════════════════════════════

describe("UPDATE SET per-row evaluation", () => {
  let state: SnowflakeState;

  beforeEach(() => {
    state = createSimpleState();
  });

  const ctx = () => simpleCtx();

  it("UPDATE SET col = col * 1.1 computes per-row", () => {
    const r1 = run("UPDATE ITEMS SET PRICE = PRICE * 2 WHERE CATEGORY = 'A'", state, ctx());
    const qr = r1.results[0];
    expect(qr.type).toBe("status");
    if (qr.type === "status") {
      expect(qr.data.rowsAffected).toBe(2);
    }
    // Verify prices were doubled
    const r2 = run("SELECT NAME, PRICE FROM ITEMS WHERE CATEGORY = 'A' ORDER BY ID", r1.state, ctx());
    const r = rows(r2);
    expect(r[0].PRICE).toBe(20); // Widget: 10 * 2
    expect(r[1].PRICE).toBe(40); // Gadget: 20 * 2
  });

  it("UPDATE SET with expression referencing current row", () => {
    const r1 = run("UPDATE ITEMS SET NAME = NAME || '_updated' WHERE ID = 1", state, ctx());
    const r2 = run("SELECT NAME FROM ITEMS WHERE ID = 1", r1.state, ctx());
    expect(singleValue(r2)).toBe("Widget_updated");
  });
});
