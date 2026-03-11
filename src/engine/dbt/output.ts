import { colorize, ansi } from "../../lib/ansi";
import { highlightSql } from "../../lib/sqlHighlight";
import { ModelRunResult, DbtTestResult, DbtRunSummary, DbtDebugInfo } from "./types";

const TIMESTAMP = "21:35:48";

function ts(): string {
  return colorize(TIMESTAMP, ansi.dim);
}

/**
 * Format the header shown at the start of dbt run/build.
 */
export function formatRunHeader(modelCount: number, testCount: number, sourceCount: number, seedCount: number = 0): string {
  const lines = [
    `${ts()}  Running with dbt=1.7.4`,
    `${ts()}  Found ${modelCount} models, ${testCount} tests, ${sourceCount} sources, ${seedCount} seeds, 0 exposures, 0 metrics`,
    `${ts()}  Concurrency: 4 threads (target='prod')`,
    `${ts()}`,
  ];
  return lines.join("\n");
}

/**
 * Format a single model run line.
 */
export function formatModelRun(
  index: number,
  total: number,
  modelName: string,
  result: ModelRunResult,
  executionTime: number
): string {
  const num = `${index} of ${total}`;
  const statusColor = result.status === "success" ? ansi.green : ansi.red;
  const statusText = result.status === "success" ? "OK" : "ERROR";

  let action: string;
  if (result.materialization === "view") {
    action = "created view model";
  } else if (result.materialization === "ephemeral") {
    action = "created ephemeral model";
  } else {
    action = "created table model";
  }

  const fqn = colorize(`analytics.${modelName}`, ansi.cyan);

  let timing: string;
  if (result.materialization === "view") {
    timing = `CREATE VIEW in ${executionTime.toFixed(2)}s`;
  } else if (result.materialization === "ephemeral") {
    timing = `OK`;
  } else {
    timing = `SELECT ${result.rowsAffected} in ${executionTime.toFixed(2)}s`;
  }

  // Pad the model line with dots
  const prefix = `${ts()}  ${num} ${colorize(statusText, statusColor)} ${action} ${fqn} `;
  const suffix = ` [${timing}]`;
  const dotCount = Math.max(2, 60 - modelName.length);
  const dots = ".".repeat(dotCount);

  return `${prefix}${colorize(dots, ansi.dim)}${suffix}`;
}

/**
 * Format a single test run line.
 */
export function formatTestRun(
  index: number,
  total: number,
  result: DbtTestResult,
  time: number
): string {
  const num = `${index} of ${total}`;

  let statusText: string;
  let statusColor: string;
  let detail: string;

  switch (result.status) {
    case "pass":
      statusText = "PASS";
      statusColor = ansi.green;
      detail = `PASS in ${time.toFixed(2)}s`;
      break;
    case "warn":
      statusText = "WARN";
      statusColor = ansi.yellow;
      detail = `WARN 1 in ${time.toFixed(2)}s`;
      break;
    case "fail":
      statusText = "FAIL";
      statusColor = ansi.red;
      detail = `FAIL in ${time.toFixed(2)}s`;
      break;
  }

  const prefix = `${ts()}  ${num} ${colorize(statusText, statusColor)} ${result.name} `;
  const suffix = ` [${detail}]`;
  const dotCount = Math.max(2, 60 - result.name.length);
  const dots = ".".repeat(dotCount);

  return `${prefix}${colorize(dots, ansi.dim)}${suffix}`;
}

/**
 * Format the summary line at the end of a run.
 */
export function formatSummary(summary: DbtRunSummary): string {
  const parts: string[] = [];
  parts.push(`PASS=${summary.pass}`);
  parts.push(`WARN=${summary.warn}`);
  parts.push(`ERROR=${summary.error}`);
  parts.push(`SKIP=${summary.skip}`);
  parts.push(`TOTAL=${summary.total}`);
  return `${ts()}  Done. ${parts.join(" ")}`;
}

/**
 * Format `dbt debug` output showing connection info.
 */
export function formatDebug(info: DbtDebugInfo): string {
  const lines = [
    `${ts()}  Running with dbt=${info.dbtVersion}`,
    `${ts()}  dbt version: ${info.dbtVersion}`,
    `${ts()}`,
    `${ts()}  ${colorize("Configuration:", ansi.bold)}`,
    `${ts()}    profiles.yml file ${colorize("[OK found]", ansi.green)}`,
    `${ts()}    dbt_project.yml file ${colorize("[OK found]", ansi.green)}`,
    `${ts()}`,
    `${ts()}  ${colorize("Connection:", ansi.bold)}`,
    `${ts()}    account: ${info.account}`,
    `${ts()}    user: ${colorize(info.user, ansi.yellow)}`,
    `${ts()}    database: ${info.database}`,
    `${ts()}    warehouse: ${info.warehouse}`,
    `${ts()}    role: ${info.role}`,
    `${ts()}    schema: ${info.schema}`,
    `${ts()}`,
    `${ts()}  ${colorize("Connection test:", ansi.bold)} ${colorize("[OK connection ok]", ansi.green)}`,
    `${ts()}  All checks passed!`,
  ];
  return lines.join("\n");
}

/**
 * Format `dbt show` output as a table with borders.
 */
export function formatShowOutput(
  modelName: string,
  columns: string[],
  rows: string[][],
  totalRows: number
): string {
  // Calculate column widths
  const widths = columns.map((col, i) => {
    let max = col.length;
    for (const row of rows) {
      if (row[i] && row[i].length > max) max = row[i].length;
    }
    return max;
  });

  const separator = "+-" + widths.map((w) => "-".repeat(w)).join("-+-") + "-+";
  const header = "| " + columns.map((col, i) => col.padEnd(widths[i])).join(" | ") + " |";

  const dataLines = rows.map(
    (row) => "| " + row.map((cell, i) => (cell ?? "").padEnd(widths[i])).join(" | ") + " |"
  );

  const lines = [
    `${ts()}  Previewing model ${colorize(modelName, ansi.cyan)}:`,
    "",
    separator,
    header,
    separator,
    ...dataLines,
    separator,
    "",
    colorize(`  Showing ${rows.length} of ${totalRows} rows`, ansi.dim),
  ];

  return lines.join("\n");
}

/**
 * Format `dbt compile` output showing resolved SQL.
 */
export function formatCompiledSql(modelName: string, sql: string): string {
  const lines = [
    `${ts()}  Compiled model ${colorize(modelName, ansi.cyan)}:`,
    "",
    highlightSql(sql),
  ];
  return lines.join("\n");
}

/**
 * Format `dbt --version` output.
 */
export function formatVersion(): string {
  return [
    "Core:",
    `  - installed: ${colorize("1.7.4", ansi.green)}`,
  ].join("\n");
}

/**
 * Format usage/help text for `dbt` with no args or unknown subcommand.
 */
export function formatUsage(): string {
  return [
    "Usage: dbt COMMAND [OPTIONS]",
    "",
    "dbt (data build tool) — transform data in the warehouse.",
    "",
    "Commands:",
    "  run              Run all models",
    "  test             Run data tests",
    "  build            Run models then tests",
    "  ls               List resources",
    "  debug            Show connection info",
    "  compile          Show compiled SQL",
    "  show             Preview model output",
    "  --version        Show dbt version",
  ].join("\n");
}
