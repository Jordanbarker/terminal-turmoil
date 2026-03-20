import { CommandContext, CommandResult, IncrementalLine } from "../commands/types";
import { DbtDebugInfo, DbtRunSummary } from "./types";
import { findDbtProject, parseProjectConfig, discoverModels, discoverResources } from "./project";
import {
  MODEL_RESULTS,
  STANDARD_MODEL_ORDER,
  CHIP_INTERNAL_MODELS,
  TEST_RESULTS,
  MODEL_PREVIEW_DATA,
  COMPILED_SQL,
} from "./data";
import {
  formatRunHeader,
  formatModelRun,
  formatTestRun,
  formatSummary,
  formatDebug,
  formatShowOutput,
  formatCompiledSql,
} from "./output";
import { DBT_DEFAULT_LINE_DELAY_MS, jitterDelay } from "../../lib/timing";
import { materializeModels } from "./materialize";

function loadProject(ctx: CommandContext): { projectRoot: string } | { error: string } {
  const projectRoot = findDbtProject(ctx.fs, ctx.cwd);
  if (!projectRoot) {
    return { error: "Runtime Error\n  Could not find dbt_project.yml." };
  }
  return { projectRoot };
}

/**
 * Run models. If selectModel is provided, run only that model.
 */
export function runModels(ctx: CommandContext, selectModel?: string): CommandResult {
  const project = loadProject(ctx);
  if ("error" in project) return { output: project.error };

  const configContent = ctx.fs.readFile(project.projectRoot + "/dbt_project.yml");
  if (!configContent.content) return { output: "Error reading dbt_project.yml" };
  const config = parseProjectConfig(configContent.content);

  // Discover models from filesystem
  const discoveredModels = discoverModels(ctx.fs, project.projectRoot, config);

  let modelsToRun: string[];
  if (selectModel) {
    // If selecting a specific model, run it even if it's in _chip_internal
    if (MODEL_RESULTS[selectModel]) {
      modelsToRun = [selectModel];
    } else {
      return { output: `Selector error: model '${selectModel}' not found` };
    }
  } else {
    // Default: run discovered models excluding _chip_internal
    modelsToRun = discoveredModels.filter((m) => !CHIP_INTERNAL_MODELS.includes(m));
  }

  // Sort in dependency order based on STANDARD_MODEL_ORDER
  modelsToRun.sort((a, b) => {
    const ai = STANDARD_MODEL_ORDER.indexOf(a);
    const bi = STANDARD_MODEL_ORDER.indexOf(b);
    // Unknown models go to the end
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const sourceCount = 6; // hardcoded source count
  const seedCount = discoverResources(ctx.fs, project.projectRoot, config).filter((r) => r.type === "seed").length;
  const lines: IncrementalLine[] = [{ text: formatRunHeader(modelsToRun.length, TEST_RESULTS.length, sourceCount, seedCount), delayMs: DBT_DEFAULT_LINE_DELAY_MS }];

  let pass = 0;
  let error = 0;
  for (let i = 0; i < modelsToRun.length; i++) {
    const name = modelsToRun[i];
    const result = MODEL_RESULTS[name];
    if (result) {
      const isEphemeral = result.materialization === "ephemeral";
      const jitteredMs = isEphemeral ? DBT_DEFAULT_LINE_DELAY_MS : jitterDelay(result.executionTime * 1000);
      const executionTime = isEphemeral ? result.executionTime : jitteredMs / 1000;
      lines.push({ text: formatModelRun(i + 1, modelsToRun.length, name, result, executionTime), delayMs: jitteredMs });
      if (result.status === "success") pass++;
      else error++;
    }
  }

  const summary: DbtRunSummary = { pass, warn: 0, error, skip: 0, total: modelsToRun.length };
  lines.push({ text: "", delayMs: DBT_DEFAULT_LINE_DELAY_MS });
  lines.push({ text: formatSummary(summary), delayMs: DBT_DEFAULT_LINE_DELAY_MS });

  // Materialize successful non-ephemeral models into Snowflake state
  if (ctx.snowflakeState) {
    const successfulModels = modelsToRun.filter((m) => {
      const r = MODEL_RESULTS[m];
      return r && r.status === "success" && r.materialization !== "ephemeral";
    });
    if (successfulModels.length > 0) {
      const newState = materializeModels(ctx.snowflakeState, successfulModels);
      ctx.setSnowflakeState?.(newState);
    }
  }

  const hasChipInternal = modelsToRun.some((m) => CHIP_INTERNAL_MODELS.includes(m));
  return {
    output: lines.map((l) => l.text).join("\n"),
    ...(hasChipInternal && { triggerEvents: [{ type: "file_read" as const, detail: "found_data_filtering" }] }),
    ...(!ctx.isPiped && { incrementalLines: lines }),
  };
}

/**
 * Run all tests.
 */
export function runTests(ctx: CommandContext): CommandResult {
  const project = loadProject(ctx);
  if ("error" in project) return { output: project.error };

  const lines: IncrementalLine[] = [];
  let pass = 0;
  let warn = 0;
  let error = 0;

  for (let i = 0; i < TEST_RESULTS.length; i++) {
    const result = TEST_RESULTS[i];
    const jitteredMs = jitterDelay(result.time * 1000);
    const time = jitteredMs / 1000;
    lines.push({ text: formatTestRun(i + 1, TEST_RESULTS.length, result, time), delayMs: jitteredMs });
    if (result.status === "pass") pass++;
    else if (result.status === "warn") warn++;
    else error++;
  }

  const summary: DbtRunSummary = { pass, warn, error, skip: 0, total: TEST_RESULTS.length };
  lines.push({ text: "", delayMs: DBT_DEFAULT_LINE_DELAY_MS });
  lines.push({ text: formatSummary(summary), delayMs: DBT_DEFAULT_LINE_DELAY_MS });

  return {
    output: lines.map((l) => l.text).join("\n"),
    ...(!ctx.isPiped && { incrementalLines: lines }),
  };
}

/**
 * Run models then tests (dbt build).
 */
export function runBuild(ctx: CommandContext, selectedModel?: string): CommandResult {
  const runResult = runModels(ctx, selectedModel);
  if (runResult.output.startsWith("Runtime Error")) return runResult;

  const testResult = runTests(ctx);

  const combinedLines = [...(runResult.incrementalLines || []), { text: "", delayMs: DBT_DEFAULT_LINE_DELAY_MS }, ...(testResult.incrementalLines || [])];
  return {
    output: runResult.output + "\n\n" + testResult.output,
    ...(!ctx.isPiped && { incrementalLines: combinedLines }),
    triggerEvents: [
      ...(runResult.triggerEvents || []),
      { type: "command_executed" as const, detail: "dbt_build" },
    ],
  };
}

/**
 * List resources. Optionally filter by type.
 */
export function listResources(ctx: CommandContext, resourceType?: string): CommandResult {
  const project = loadProject(ctx);
  if ("error" in project) return { output: project.error };

  const configContent = ctx.fs.readFile(project.projectRoot + "/dbt_project.yml");
  if (!configContent.content) return { output: "Error reading dbt_project.yml" };
  const config = parseProjectConfig(configContent.content);

  let resources = discoverResources(ctx.fs, project.projectRoot, config);

  // Exclude _chip_internal models by default
  resources = resources.filter((r) => !CHIP_INTERNAL_MODELS.includes(r.name));

  if (resourceType) {
    resources = resources.filter((r) => r.type === resourceType);
  }

  if (resources.length === 0) {
    return { output: "No resources found." };
  }

  const lines = resources.map((r) => {
    const prefix = `${config.name}.${r.name}`;
    return prefix;
  });

  return { output: lines.join("\n") };
}

/**
 * Show debug/connection info.
 */
export function debugProject(ctx: CommandContext): CommandResult {
  const project = loadProject(ctx);
  if ("error" in project) return { output: project.error };

  const info: DbtDebugInfo = {
    account: "nexacorp.us-east-1",
    user: "chip_service_account",
    database: "NEXACORP_PROD",
    warehouse: "NEXACORP_WH",
    role: "TRANSFORMER",
    schema: "ANALYTICS",
    dbtVersion: "1.7.4",
    profileName: "nexacorp",
    target: "prod",
  };

  return { output: formatDebug(info) };
}

/**
 * Compile a model, showing resolved SQL.
 */
export function compileModel(ctx: CommandContext, modelName?: string): CommandResult {
  const project = loadProject(ctx);
  if ("error" in project) return { output: project.error };

  if (!modelName) {
    return { output: "Usage: dbt compile --select MODEL_NAME" };
  }

  const sql = COMPILED_SQL[modelName];
  if (!sql) {
    return { output: `Selector error: model '${modelName}' not found` };
  }

  // Write compiled SQL to target/compiled/ (create dir if needed)
  let fs = ctx.fs;
  const compiledDir = project.projectRoot + "/target/compiled";
  if (!fs.getNode(compiledDir)) {
    const mkdirResult = fs.makeDirectory(compiledDir);
    if (mkdirResult.fs) fs = mkdirResult.fs;
  }
  const targetPath = compiledDir + "/" + modelName + ".sql";
  const writeResult = fs.writeFile(targetPath, sql);

  const isChipInternal = CHIP_INTERNAL_MODELS.includes(modelName);
  return {
    output: formatCompiledSql(modelName, sql),
    newFs: writeResult.fs,
    ...(isChipInternal && { triggerEvents: [{ type: "file_read" as const, detail: "found_data_filtering" }] }),
  };
}

/**
 * Show sample rows from a model (dbt show --select model).
 */
export function showModel(ctx: CommandContext, modelName?: string): CommandResult {
  const project = loadProject(ctx);
  if ("error" in project) return { output: project.error };

  if (!modelName) {
    return { output: "Usage: dbt show --select MODEL_NAME" };
  }

  const preview = MODEL_PREVIEW_DATA[modelName];
  if (!preview) {
    return { output: `Selector error: model '${modelName}' not found` };
  }

  // dbt show defaults to --limit 5
  const SHOW_LIMIT = 5;
  const displayRows = preview.rows.slice(0, SHOW_LIMIT);

  // Get total rows from MODEL_RESULTS if available
  const result = MODEL_RESULTS[modelName];
  const totalRows = result?.rowsAffected ?? preview.rows.length;

  const isChipInternal = CHIP_INTERNAL_MODELS.includes(modelName);
  return {
    output: formatShowOutput(modelName, preview.columns, displayRows, totalRows),
    ...(isChipInternal && { triggerEvents: [{ type: "file_read" as const, detail: "found_data_filtering" }] }),
  };
}
