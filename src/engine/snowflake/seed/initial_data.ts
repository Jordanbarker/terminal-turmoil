import { SnowflakeState, SnowflakeData } from "../state";
import { Database, Schema, Table, Column, Row, createSchema } from "../types";

import nexacorpDbJson from "./generated/nexacorp_db.json";
import nexacorpProdJson from "./generated/nexacorp_prod.json";
import chipAnalyticsJson from "./generated/chip_analytics.json";

// ── Date columns per table (for reconstituting Date objects from JSON strings) ──
const DATE_COLUMNS: Record<string, Set<string>> = {
  EMPLOYEES: new Set(["HIRE_DATE", "TERMINATION_DATE"]),
  PROJECTS: new Set(["START_DATE"]),
  ACCESS_LOG: new Set(["TIMESTAMP"]),
  SYSTEM_EVENTS: new Set(["TIMESTAMP"]),
  AI_MODEL_METRICS: new Set(["METRIC_DATE"]),
  DEPARTMENT_BUDGETS: new Set(["APPROVED_DATE"]),
  SUPPORT_TICKETS: new Set(["SUBMITTED_DATE", "RESOLVED_DATE"]),
  FILE_MODIFICATIONS: new Set(["TIMESTAMP"]),
  DIRECTIVE_LOG: new Set(["TIMESTAMP"]),
  SUPPRESSED_ALERTS: new Set(["TIMESTAMP"]),
};

/**
 * Create the initial SnowflakeState with narrative game data.
 */
export function createInitialSnowflakeState(): SnowflakeState {
  const data: SnowflakeData = {
    databases: {
      NEXACORP_DB: loadDatabase(nexacorpDbJson as unknown as JsonDatabase),
      NEXACORP_PROD: loadDatabase(nexacorpProdJson as unknown as JsonDatabase),
      CHIP_ANALYTICS: loadDatabase(chipAnalyticsJson as unknown as JsonDatabase),
    },
    warehouses: {
      NEXACORP_WH: {
        name: "NEXACORP_WH",
        size: "X-Small",
        state: "STARTED",
        autoSuspend: 600,
      },
    },
  };
  return new SnowflakeState(data);
}

// ── JSON → Database hydration ────────────────────────────────────────

interface JsonTable {
  name: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  createdAt: string;
}

interface JsonSchema {
  tables: Record<string, JsonTable>;
}

interface JsonDatabase {
  name: string;
  schemas: Record<string, JsonSchema>;
}

function loadDatabase(json: JsonDatabase): Database {
  const schemas: Record<string, Schema> = {};
  for (const [schemaName, schemaJson] of Object.entries(json.schemas)) {
    const schema = createSchema(schemaName);
    for (const [tableName, tableJson] of Object.entries(schemaJson.tables)) {
      const dateCols = DATE_COLUMNS[tableName] || new Set<string>();
      const rows: Row[] = tableJson.rows.map((row) => hydrateRow(row, dateCols));
      schema.tables[tableName] = {
        name: tableJson.name,
        columns: tableJson.columns,
        rows,
        createdAt: new Date(tableJson.createdAt),
      };
    }
    schemas[schemaName] = schema;
  }
  return { name: json.name, schemas };
}

function hydrateRow(row: Record<string, unknown>, dateCols: Set<string>): Row {
  const result: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (dateCols.has(key) && typeof value === "string") {
      result[key] = new Date(value);
    } else if (value === null || value === undefined) {
      result[key] = null;
    } else {
      result[key] = value as Row[string];
    }
  }
  return result;
}
