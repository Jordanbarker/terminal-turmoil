import { ModelRunResult, DbtTestResult } from "./types";

import modelResultsJson from "./generated/model_results.json";
import testResultsJson from "./generated/test_results.json";
import modelPreviewDataJson from "./generated/model_preview_data.json";
import compiledSqlJson from "./generated/compiled_sql.json";
import modelOrderJson from "./generated/model_order.json";

/**
 * Pre-defined model execution results. Keyed by model name.
 * _chip_internal models are excluded from default runs.
 */
export const MODEL_RESULTS: Record<string, ModelRunResult> =
  modelResultsJson as Record<string, ModelRunResult>;

/** Standard models run in dependency order (excludes _chip_internal) */
export const STANDARD_MODEL_ORDER: string[] = modelOrderJson.standard;

/** _chip_internal models (only run when explicitly selected) */
export const CHIP_INTERNAL_MODELS: string[] = modelOrderJson.chip_internal;

/**
 * Pre-defined test results.
 */
export const TEST_RESULTS: DbtTestResult[] =
  testResultsJson as DbtTestResult[];

/**
 * Sample rows for `dbt show --select <model>`.
 * Each entry is { columns, rows } for table display.
 */
export const MODEL_PREVIEW_DATA: Record<string, { columns: string[]; rows: string[][] }> =
  modelPreviewDataJson as Record<string, { columns: string[]; rows: string[][] }>;

/**
 * Compiled SQL for `dbt compile --select <model>`.
 * Shows SQL with {{ ref() }} resolved to full table names.
 */
export const COMPILED_SQL: Record<string, string> =
  compiledSqlJson as Record<string, string>;
