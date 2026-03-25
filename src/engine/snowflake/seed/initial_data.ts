import { SnowflakeState, SnowflakeData } from "../state";
import { Database, Schema, Table, Column, Row, createSchema } from "../types";
import { generateAccessLogRows, LogOptions } from "../../../story/filesystem/logs";

import nexacorpProdJson from "../../../story/data/snowflake/nexacorp_prod.json";

// ── Date columns per table (for reconstituting Date objects from JSON strings) ──
const DATE_COLUMNS: Record<string, Set<string>> = {
  EMPLOYEES: new Set(["HIRE_DATE", "TERMINATION_DATE"]),
  EMPLOYEE_DIRECTORY: new Set(["HIRE_DATE"]),
  PROJECTS: new Set(["START_DATE"]),
  ACCESS_LOG: new Set(["TIMESTAMP"]),
  SYSTEM_EVENTS: new Set(["TIMESTAMP"]),
  AI_MODEL_METRICS: new Set(["METRIC_DATE"]),
  DEPARTMENT_BUDGETS: new Set(["APPROVED_DATE"]),
  SUPPORT_TICKETS: new Set(["SUBMITTED_DATE", "RESOLVED_DATE"]),
};

/**
 * Create the initial SnowflakeState with narrative game data.
 */
export function createInitialSnowflakeState(opts?: LogOptions): SnowflakeState {
  const data: SnowflakeData = {
    databases: {
      NEXACORP_PROD: loadDatabase(nexacorpProdJson as unknown as JsonDatabase, opts),
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

function loadDatabase(json: JsonDatabase, opts?: LogOptions): Database {
  const schemas: Record<string, Schema> = {};
  for (const [schemaName, schemaJson] of Object.entries(json.schemas)) {
    const schema = createSchema(schemaName);
    for (const [tableName, tableJson] of Object.entries(schemaJson.tables)) {
      const dateCols = DATE_COLUMNS[tableName] || new Set<string>();

      // ACCESS_LOG rows are generated from the shared access event source
      if (tableName === "ACCESS_LOG") {
        schema.tables[tableName] = {
          name: tableJson.name,
          columns: tableJson.columns,
          rows: generateAccessLogRows(opts),
          createdAt: new Date(tableJson.createdAt),
        };
        continue;
      }

      const rows: Row[] = tableJson.rows.map((row) => hydrateRow(row, dateCols));

      if (tableName === "CAMPAIGN_METRICS" && opts?.includeDay2) {
        rows.push(
          { CAMPAIGN_ID: "CM-101", CAMPAIGN_NAME: "partner_referral_q2", CHANNEL: "referral", IMPRESSIONS: 42000, CLICKS: null, CONVERSIONS: null, SPEND: 6200, REPORT_DATE: "2026-03-22" },
          { CAMPAIGN_ID: "CM-102", CAMPAIGN_NAME: "partner_referral_q2", CHANNEL: "referral", IMPRESSIONS: 38000, CLICKS: null, CONVERSIONS: null, SPEND: 5800, REPORT_DATE: "2026-03-23" },
        );
      }

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
