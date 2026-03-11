import { SnowflakeState } from "../snowflake/state";
import { Column, Row } from "../snowflake/types";
import { MODEL_RESULTS, MODEL_PREVIEW_DATA } from "./data";

const TARGET_DB = "NEXACORP_PROD";
const TARGET_SCHEMA = "ANALYTICS";

/**
 * Materialize dbt models into the Snowflake state as tables.
 * Creates tables in NEXACORP_PROD.ANALYTICS from MODEL_PREVIEW_DATA.
 * Pure function — returns a new SnowflakeState.
 */
export function materializeModels(
  state: SnowflakeState,
  modelNames: string[]
): SnowflakeState {
  let s = state;

  for (const name of modelNames) {
    const result = MODEL_RESULTS[name];
    if (!result || result.materialization === "ephemeral") continue;

    const preview = MODEL_PREVIEW_DATA[name];
    if (!preview) continue;

    const tableName = name.toUpperCase();

    // Drop existing table (idempotent re-runs)
    s = s.dropTable(TARGET_DB, TARGET_SCHEMA, tableName);

    // Create table with VARCHAR columns
    const columns: Column[] = preview.columns.map((col) => ({
      name: col.toUpperCase(),
      type: "VARCHAR" as const,
      nullable: true,
    }));
    s = s.createTable(TARGET_DB, TARGET_SCHEMA, tableName, columns);

    // Insert preview rows
    const rows: Row[] = preview.rows.map((row) => {
      const obj: Row = {};
      for (let i = 0; i < preview.columns.length; i++) {
        obj[preview.columns[i].toUpperCase()] = row[i] ?? null;
      }
      return obj;
    });
    if (rows.length > 0) {
      s = s.insertRows(TARGET_DB, TARGET_SCHEMA, tableName, rows);
    }
  }

  return s;
}
