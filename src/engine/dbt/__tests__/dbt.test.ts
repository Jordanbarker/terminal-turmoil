import { describe, it, expect } from "vitest";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { createFilesystem } from "../../../story/filesystem/nexacorp";
import { CommandContext } from "../../commands/types";
import {
  runModels,
  runTests,
  runBuild,
  listResources,
  debugProject,
  compileModel,
  showModel,
} from "../runner";
import "../../commands/builtins/dbt"; // trigger registration
import { execute } from "../../commands/registry";
import {
  formatRunHeader,
  formatModelRun,
  formatTestRun,
  formatSummary,
  formatUsage,
  formatVersion,
} from "../output";
import {
  MODEL_RESULTS,
  STANDARD_MODEL_ORDER,
  CHIP_INTERNAL_MODELS,
  TEST_RESULTS,
  MODEL_PREVIEW_DATA,
  COMPILED_SQL,
} from "../data";
import { findDbtProject, parseProjectConfig } from "../project";

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const username = "player";

function makeCtx(cwd: string): CommandContext {
  const root = createFilesystem(username, { dbt_project_cloned: true });
  const fs = new VirtualFS(root, cwd, `/home/${username}`);
  return { fs, cwd, homeDir: `/home/${username}`, activeComputer: "nexacorp" as const, storyFlags: { pipeline_tools_unlocked: true } };
}

const projectDir = `/home/${username}/nexacorp-analytics`;

describe("dbt --version", () => {
  it("returns version string", () => {
    const output = formatVersion();
    expect(output).toContain("1.7.4");
  });
});

describe("dbt run", () => {
  it("runs all standard models", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx);
    expect(result.output).toContain("Running with dbt=1.7.4");
    expect(result.output).toContain("stg_raw_nexacorp__employees");
    expect(result.output).toContain("dim_employees");
    expect(result.output).toContain("rpt_employee_directory");
    expect(result.output).toContain(`PASS=${STANDARD_MODEL_ORDER.length}`);
  });

  it("excludes _chip_internal models by default", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx);
    expect(result.output).not.toContain("chip_data_cleanup");
    expect(result.output).not.toContain("chip_log_filter");
    expect(result.output).not.toContain("chip_ticket_suppression");
  });

  it("runs a specific model with --select", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx, "dim_employees");
    expect(result.output).toContain("dim_employees");
    expect(result.output).toContain("PASS=1");
    expect(result.output).toContain(`SELECT ${MODEL_RESULTS.dim_employees.rowsAffected}`);
  });

  it("can select _chip_internal model explicitly", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx, "chip_log_filter");
    expect(result.output).toContain("chip_log_filter");
    expect(result.output).toContain(`SELECT ${MODEL_RESULTS.chip_log_filter.rowsAffected}`);
  });

  it("returns error for unknown model", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx, "nonexistent");
    expect(result.output).toContain("not found");
  });

  it("fails outside dbt project directory", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = runModels(ctx);
    expect(result.output).toContain("Could not find dbt_project.yml");
  });
});

describe("dbt test", () => {
  it("runs all tests", () => {
    const ctx = makeCtx(projectDir);
    const result = runTests(ctx);
    const passCount = TEST_RESULTS.filter((t) => t.status === "pass").length;
    const warnCount = TEST_RESULTS.filter((t) => t.status === "warn").length;
    expect(result.output).toContain(`PASS=${passCount}`);
    expect(result.output).toContain(`WARN=${warnCount}`);
  });

  it("shows PASS on assert_total_employees", () => {
    const ctx = makeCtx(projectDir);
    const result = runTests(ctx);
    expect(result.output).toContain("assert_total_employees");
    expect(result.output).toContain("PASS");
  });

  it("shows WARN on assert_all_tickets_in_directory", () => {
    const ctx = makeCtx(projectDir);
    const result = runTests(ctx);
    expect(result.output).toContain("assert_all_tickets_in_directory");
  });
});

describe("dbt build", () => {
  it("runs models then tests", () => {
    const ctx = makeCtx(projectDir);
    const result = runBuild(ctx);
    // Should contain both model run output and test output
    expect(result.output).toContain("stg_raw_nexacorp__employees");
    expect(result.output).toContain("assert_total_employees");
    const warnCount = TEST_RESULTS.filter((t) => t.status === "warn").length;
    expect(result.output).toContain(`WARN=${warnCount}`);
  });
});

describe("dbt ls", () => {
  it("lists resources", () => {
    const ctx = makeCtx(projectDir);
    const result = listResources(ctx);
    expect(result.output).toContain("stg_raw_nexacorp__employees");
    expect(result.output).toContain("dim_employees");
    expect(result.output).toContain("assert_employee_count");
  });

  it("excludes _chip_internal by default", () => {
    const ctx = makeCtx(projectDir);
    const result = listResources(ctx);
    expect(result.output).not.toContain("chip_data_cleanup");
    expect(result.output).not.toContain("chip_log_filter");
    expect(result.output).not.toContain("chip_ticket_suppression");
  });

  it("filters by resource type", () => {
    const ctx = makeCtx(projectDir);
    const result = listResources(ctx, "test");
    expect(result.output).toContain("assert_employee_count");
    expect(result.output).not.toContain("stg_raw_nexacorp__employees");
  });

  it("lists seeds via --resource-type seed", () => {
    const ctx = makeCtx(projectDir);
    const result = listResources(ctx, "seed");
    expect(result.output).toContain("department_codes");
    expect(result.output).toContain("status_codes");
  });
});

describe("dbt debug", () => {
  it("shows connection info", () => {
    const ctx = makeCtx(projectDir);
    const result = debugProject(ctx);
    expect(result.output).toContain("nexacorp.us-east-1");
    expect(result.output).toContain("NEXACORP_PROD");
    expect(result.output).toContain("NEXACORP_WH");
  });

  it("reveals chip_service_account", () => {
    const ctx = makeCtx(projectDir);
    const result = debugProject(ctx);
    expect(result.output).toContain("chip_service_account");
  });
});

describe("dbt compile", () => {
  it("shows compiled SQL with refs resolved", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "dim_employees");
    expect(result.output).toContain("NEXACORP_PROD.ANALYTICS.STG_RAW_NEXACORP__EMPLOYEES");
    expect(result.output).not.toContain("{{ ref(");
    expect(result.output).toContain("status = 'active'");
  });

  it("returns error for unknown model", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "nonexistent");
    expect(result.output).toContain("not found");
  });

  it("returns newFs when writing to target/compiled/", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "stg_raw_nexacorp__employees");
    expect(result.newFs).toBeDefined();
  });
});

describe("dbt show", () => {
  it("shows preview data for dim_employees", () => {
    const ctx = makeCtx(projectDir);
    const result = showModel(ctx, "dim_employees");
    expect(result.output).toContain("EMPLOYEE_ID");
    // First preview row name should appear
    const firstName = MODEL_PREVIEW_DATA.dim_employees.rows[0][1];
    expect(result.output).toContain(firstName);
    // Jin Chen should NOT be in dim_employees preview
    expect(result.output).not.toContain("Jin Chen");
  });

  it("shows preview data for stg_raw_nexacorp__employees (unfiltered)", () => {
    const ctx = makeCtx(projectDir);
    const result = showModel(ctx, "stg_raw_nexacorp__employees");
    expect(result.output).toContain("EMPLOYEE_ID");
    expect(result.output).toContain("NOTES");
  });

  it("shows chip_ticket_suppression with 4 suppressed tickets", () => {
    const ctx = makeCtx(projectDir);
    const result = showModel(ctx, "chip_ticket_suppression");
    expect(result.output).toContain("TK-4410");
    expect(result.output).toContain("auto-resolved: operational noise");
  });

  it("returns error for unknown model", () => {
    const ctx = makeCtx(projectDir);
    const result = showModel(ctx, "nonexistent");
    expect(result.output).toContain("not found");
  });
});

describe("findDbtProject", () => {
  it("finds project from project root", () => {
    const ctx = makeCtx(projectDir);
    const result = findDbtProject(ctx.fs, projectDir);
    expect(result).toBe(projectDir);
  });

  it("finds project from subdirectory", () => {
    const ctx = makeCtx(projectDir);
    const result = findDbtProject(ctx.fs, projectDir + "/models/staging");
    expect(result).toBe(projectDir);
  });

  it("returns null outside project", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = findDbtProject(ctx.fs, `/home/${username}`);
    expect(result).toBeNull();
  });
});

describe("parseProjectConfig", () => {
  it("parses project name and version", () => {
    const content = `name: 'nexacorp_analytics'\nversion: '1.0.0'\nprofile: 'nexacorp'\nmodel-paths: ["models"]`;
    const config = parseProjectConfig(content);
    expect(config.name).toBe("nexacorp_analytics");
    expect(config.version).toBe("1.0.0");
    expect(config.profile).toBe("nexacorp");
    expect(config.modelPaths).toEqual(["models"]);
  });
});

// ---------------------------------------------------------------------------
// 1. Command Handler Integration
// ---------------------------------------------------------------------------
describe("dbt command handler", () => {
  it("shows usage when called with no args", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", [], {}, ctx);
    expect(result.output).toContain("Usage: dbt COMMAND");
  });

  it("shows version via --version flag", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", [], { version: true }, ctx);
    expect(result.output).toContain("1.7.4");
  });

  it("runs all models via dbt run", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["run"], {}, ctx);
    expect(result.output).toContain(`PASS=${STANDARD_MODEL_ORDER.length}`);
  });

  it("runs a single model via dbt run --select", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["run", "dim_employees"], { select: true }, ctx);
    expect(result.output).toContain("PASS=1");
    expect(result.output).toContain(`SELECT ${MODEL_RESULTS.dim_employees.rowsAffected}`);
  });

  it("runs tests via dbt test", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["test"], {}, ctx);
    const passCount = TEST_RESULTS.filter((t) => t.status === "pass").length;
    const warnCount = TEST_RESULTS.filter((t) => t.status === "warn").length;
    expect(result.output).toContain(`PASS=${passCount}`);
    expect(result.output).toContain(`WARN=${warnCount}`);
  });

  it("runs build via dbt build", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["build"], {}, ctx);
    expect(result.output).toContain("stg_raw_nexacorp__employees");
    expect(result.output).toContain("assert_total_employees");
  });

  it("lists resources via dbt ls", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["ls"], {}, ctx);
    expect(result.output).toContain("stg_raw_nexacorp__employees");
    expect(result.output).toContain("dim_employees");
  });

  it("treats dbt list as alias for ls", () => {
    const ctx = makeCtx(projectDir);
    const lsResult = execute("dbt", ["ls"], {}, ctx);
    const listResult = execute("dbt", ["list"], {}, ctx);
    expect(listResult.output).toBe(lsResult.output);
  });

  it("filters resources via dbt ls --resource-type", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["ls", "test"], { "resource-type": true }, ctx);
    expect(result.output).toContain("assert_employee_count");
    expect(result.output).not.toContain("stg_raw_nexacorp__employees");
  });

  it("shows help text via dbt help", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["help"], {}, ctx);
    expect(result.output).toContain("dbt run");
    expect(result.output).toContain("dbt test");
  });

  it("shows error for unknown subcommand", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["snapshot"], {}, ctx);
    expect(result.output).toContain("Unknown dbt command 'snapshot'");
    expect(result.output).toContain("Usage: dbt COMMAND");
  });

  it("shows compile usage when --select is missing", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["compile"], {}, ctx);
    expect(result.output).toContain("Usage: dbt compile --select MODEL_NAME");
  });
});

// ---------------------------------------------------------------------------
// 2. Output Format Fidelity
// ---------------------------------------------------------------------------
describe("output format fidelity", () => {
  it("formatRunHeader has timestamp on every non-empty line", () => {
    const header = stripAnsi(formatRunHeader(15, 23, 6, 2));
    const lines = header.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      expect(line).toMatch(/^21:35:48/);
    }
  });

  it("formatRunHeader shows correct counts", () => {
    const header = stripAnsi(formatRunHeader(15, 23, 6, 2));
    expect(header).toContain("Found 15 models, 23 tests, 6 sources, 2 seeds");
  });

  it("formatModelRun formats view materialization", () => {
    const line = stripAnsi(formatModelRun(1, 15, "stg_raw_nexacorp__employees", MODEL_RESULTS["stg_raw_nexacorp__employees"]));
    expect(line).toContain("created view model");
    expect(line).toContain("CREATE VIEW in 0.15s");
  });

  it("formatModelRun formats table materialization", () => {
    const line = stripAnsi(formatModelRun(10, 15, "dim_employees", MODEL_RESULTS.dim_employees));
    expect(line).toContain("created table model");
    expect(line).toContain(`SELECT ${MODEL_RESULTS.dim_employees.rowsAffected} in 0.67s`);
  });

  it("formatModelRun formats ephemeral materialization", () => {
    const line = stripAnsi(formatModelRun(7, 15, "int_employees_joined_to_events", MODEL_RESULTS["int_employees_joined_to_events"]));
    expect(line).toContain("created ephemeral model");
    expect(line).toContain("[OK]");
  });

  it("formatModelRun includes dot padding", () => {
    const line = stripAnsi(formatModelRun(1, 15, "stg_raw_nexacorp__employees", MODEL_RESULTS["stg_raw_nexacorp__employees"]));
    expect(line).toContain("..");
  });

  it("formatTestRun formats PASS status", () => {
    const passResult = TEST_RESULTS[0];
    const line = stripAnsi(formatTestRun(1, 23, passResult));
    expect(line).toContain("PASS");
    expect(line).toContain(`PASS in ${passResult.time.toFixed(2)}s`);
  });

  it("formatTestRun formats WARN status", () => {
    const warnResult = TEST_RESULTS.find((t) => t.status === "warn")!;
    const idx = TEST_RESULTS.indexOf(warnResult) + 1;
    const line = stripAnsi(formatTestRun(idx, 23, warnResult));
    expect(line).toContain("WARN");
    expect(line).toContain("WARN 1 in");
  });

  it("formatSummary produces correct format", () => {
    const passCount = TEST_RESULTS.filter((t) => t.status === "pass").length;
    const warnCount = TEST_RESULTS.filter((t) => t.status === "warn").length;
    const total = passCount + warnCount;
    const summary = stripAnsi(formatSummary({ pass: passCount, warn: warnCount, error: 0, skip: 0, total }));
    expect(summary).toContain(`Done. PASS=${passCount} WARN=${warnCount} ERROR=0 SKIP=0 TOTAL=${total}`);
  });

  it("formatUsage lists all commands", () => {
    const usage = formatUsage();
    for (const cmd of ["run", "test", "build", "ls", "debug", "compile", "show", "--version"]) {
      expect(usage).toContain(cmd);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Runner Coverage Gaps
// ---------------------------------------------------------------------------
describe("dbt run (additional)", () => {
  it("runs models in dependency order (staging before marts)", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx);
    const plain = stripAnsi(result.output);
    const stgPos = plain.indexOf("stg_raw_nexacorp__employees");
    const dimPos = plain.indexOf("dim_employees");
    const rptPos = plain.indexOf("rpt_employee_directory");
    expect(stgPos).toBeLessThan(dimPos);
    expect(dimPos).toBeLessThan(rptPos);
  });

  it("runs chip_log_filter with correct row count", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx, "chip_log_filter");
    expect(result.output).toContain(`SELECT ${MODEL_RESULTS.chip_log_filter.rowsAffected}`);
    expect(result.output).toContain("PASS=1");
  });

  it("header model count matches summary total", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx);
    const plain = stripAnsi(result.output);
    const headerMatch = plain.match(/Found (\d+) models/);
    const summaryMatch = plain.match(/TOTAL=(\d+)/);
    expect(headerMatch).not.toBeNull();
    expect(summaryMatch).not.toBeNull();
    expect(headerMatch![1]).toBe(summaryMatch![1]);
  });
});

describe("dbt test (additional)", () => {
  it("includes all test names in output", () => {
    const ctx = makeCtx(projectDir);
    const result = runTests(ctx);
    for (const t of TEST_RESULTS) {
      expect(result.output).toContain(t.name);
    }
  });

  it("does not show run header", () => {
    const ctx = makeCtx(projectDir);
    const result = runTests(ctx);
    expect(result.output).not.toContain("Running with dbt=");
  });

  it("shows WARN count in timing", () => {
    const ctx = makeCtx(projectDir);
    const result = runTests(ctx);
    expect(stripAnsi(result.output)).toContain("WARN 1 in");
  });
});

describe("dbt build (additional)", () => {
  it("shows models before tests in output", () => {
    const ctx = makeCtx(projectDir);
    const result = runBuild(ctx);
    const plain = stripAnsi(result.output);
    const modelPos = plain.indexOf("created view model");
    const testPos = plain.indexOf("assert_total_employees");
    expect(modelPos).toBeLessThan(testPos);
  });

  it("fails outside project directory", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = runBuild(ctx);
    expect(result.output).toContain("Could not find dbt_project.yml");
  });
});

describe("dbt ls (additional)", () => {
  it("lists source resources", () => {
    const ctx = makeCtx(projectDir);
    const result = listResources(ctx, "source");
    expect(result.output).not.toBe("No resources found.");
    expect(result.output).toContain("nexacorp_analytics.");
  });

  it("lists seed resources", () => {
    const ctx = makeCtx(projectDir);
    const result = listResources(ctx, "seed");
    expect(result.output).toContain("department_codes");
    expect(result.output).toContain("status_codes");
  });

  it("fails outside project directory", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = listResources(ctx);
    expect(result.output).toContain("Could not find dbt_project.yml");
  });

  it("prefixes each resource with project name", () => {
    const ctx = makeCtx(projectDir);
    const result = listResources(ctx);
    const lines = result.output.split("\n").filter((l) => l.length > 0);
    for (const line of lines) {
      expect(line).toMatch(/^nexacorp_analytics\./);
    }
  });
});

describe("dbt debug (additional)", () => {
  it("shows all checks passed", () => {
    const ctx = makeCtx(projectDir);
    const result = debugProject(ctx);
    expect(result.output).toContain("All checks passed!");
  });

  it("shows dbt version", () => {
    const ctx = makeCtx(projectDir);
    const result = debugProject(ctx);
    expect(result.output).toContain("dbt version: 1.7.4");
  });

  it("fails outside project directory", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = debugProject(ctx);
    expect(result.output).toContain("Could not find dbt_project.yml");
  });
});

describe("dbt compile (additional)", () => {
  it("shows usage when no model specified", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx);
    expect(result.output).toContain("Usage: dbt compile --select MODEL_NAME");
  });

  it("compiles chip_log_filter with chip-daemon filter SQL", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "chip_log_filter");
    expect(result.output).toContain("chip-daemon");
  });

  it("writes compiled file to target/compiled/", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "stg_raw_nexacorp__employees");
    expect(result.newFs).toBeDefined();
    const compiled = result.newFs!.readFile(`${projectDir}/target/compiled/stg_raw_nexacorp__employees.sql`);
    expect(compiled.content).toContain("NEXACORP_PROD");
  });

  it("fails outside project directory", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = compileModel(ctx, "dim_employees");
    expect(result.output).toContain("Could not find dbt_project.yml");
  });
});

describe("dbt show (additional)", () => {
  it("shows chip_log_filter with chip-daemon events", () => {
    const ctx = makeCtx(projectDir);
    const result = showModel(ctx, "chip_log_filter");
    expect(result.output).toContain("chip-daemon");
    expect(result.output).toContain("FILTER_REASON");
  });

  it("shows fct_support_tickets (non-Chip tickets only)", () => {
    const ctx = makeCtx(projectDir);
    const result = showModel(ctx, "fct_support_tickets");
    expect(result.output).toContain("Monitor flickering");
    expect(result.output).not.toContain("chip_service_account");
  });

  it("shows chip_ticket_suppression with 4 suppressed tickets", () => {
    const ctx = makeCtx(projectDir);
    const result = showModel(ctx, "chip_ticket_suppression");
    expect(result.output).toContain("TK-4410");
    expect(result.output).toContain("TK-4418");
    expect(result.output).toContain("auto-resolved: operational noise");
  });

  it("shows usage when no model specified", () => {
    const ctx = makeCtx(projectDir);
    const result = showModel(ctx);
    expect(result.output).toContain("Usage: dbt show --select MODEL_NAME");
  });

  it("fails outside project directory", () => {
    const ctx = makeCtx(`/home/${username}`);
    const result = showModel(ctx, "dim_employees");
    expect(result.output).toContain("Could not find dbt_project.yml");
  });

  it("shows correct row counts for rpt_employee_directory", () => {
    const ctx = makeCtx(projectDir);
    const result = showModel(ctx, "rpt_employee_directory");
    expect(result.output).toContain(`Showing 5 of ${MODEL_RESULTS.rpt_employee_directory.rowsAffected} rows`);
  });
});

// ---------------------------------------------------------------------------
// 4. Narrative-Critical Data Tests
// ---------------------------------------------------------------------------
describe("narrative data integrity", () => {
  it("dim_employees returns correct active employee count", () => {
    const dimRows = MODEL_RESULTS.dim_employees.rowsAffected!;
    expect(dimRows).toBe(77);
  });

  it("assert_total_employees warns (count mismatch reveals filtering)", () => {
    const warnTest = TEST_RESULTS.find((t) => t.name === "assert_total_employees");
    expect(warnTest).toBeDefined();
    expect(warnTest!.status).toBe("warn");
  });

  it("WARN on ticket submitters references missing employees", () => {
    const warnTest = TEST_RESULTS.find((t) => t.name === "assert_all_tickets_in_directory");
    expect(warnTest).toBeDefined();
    expect(warnTest!.status).toBe("warn");
    expect(warnTest!.message).toContain("E038");
  });

  it("fct_system_events SQL filters chip-daemon and suspicious events", () => {
    expect(COMPILED_SQL.fct_system_events).toContain("event_source != 'chip-daemon'");
    expect(COMPILED_SQL.fct_system_events).toContain("event_type not in");
    expect(COMPILED_SQL.fct_system_events).toContain("file_modification");
    expect(COMPILED_SQL.fct_system_events).toContain("permission_change");
  });

  it("fct_support_tickets SQL filters chip_service_account tickets", () => {
    expect(COMPILED_SQL.fct_support_tickets).toContain("chip_service_account");
  });

  it("chip_ticket_suppression shows 4 suppressed tickets", () => {
    expect(MODEL_RESULTS.chip_ticket_suppression.rowsAffected).toBe(4);
    const preview = MODEL_PREVIEW_DATA.chip_ticket_suppression;
    expect(preview.rows).toHaveLength(4);
  });

  it("fct_support_tickets excludes chip_service_account tickets", () => {
    expect(MODEL_RESULTS.fct_support_tickets.rowsAffected).toBe(
      MODEL_RESULTS.fct_support_tickets.rowsAffected
    );
    // Should be total tickets minus chip-resolved tickets
    const totalTickets = MODEL_RESULTS.fct_support_tickets.rowsAffected! + MODEL_RESULTS.chip_ticket_suppression.rowsAffected!;
    expect(totalTickets).toBeGreaterThan(MODEL_RESULTS.fct_support_tickets.rowsAffected!);
  });

  it("dim_employees compiled SQL reveals system concern filter", () => {
    expect(COMPILED_SQL.dim_employees).toContain("status = 'active'");
    expect(COMPILED_SQL.dim_employees).toContain("system concern");
  });

  it("CHIP_INTERNAL_MODELS contains exactly 4 hidden models", () => {
    expect(CHIP_INTERNAL_MODELS).toEqual(["chip_data_cleanup", "chip_log_filter", "chip_ticket_suppression", "chip_metric_inflation"]);
  });

  it("chip_log_filter SQL has 3am automated timestamp", () => {
    expect(COMPILED_SQL.chip_log_filter).toContain("03:22:17");
    expect(COMPILED_SQL.chip_log_filter).toContain("automated");
  });
});

// ---------------------------------------------------------------------------
// 5. Project Discovery Edge Cases
// ---------------------------------------------------------------------------
describe("findDbtProject (additional)", () => {
  it("finds project from models/marts subdirectory", () => {
    const ctx = makeCtx(projectDir);
    const result = findDbtProject(ctx.fs, projectDir + "/models/marts");
    expect(result).toBe(projectDir);
  });

  it("returns null from root directory", () => {
    const ctx = makeCtx(projectDir);
    const result = findDbtProject(ctx.fs, "/");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. found_data_filtering triggerEvents
// ---------------------------------------------------------------------------
describe("found_data_filtering triggerEvents", () => {
  const filterEvent = { type: "file_read", detail: "found_data_filtering" };

  it("runModels emits triggerEvent for chip_internal model", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx, "chip_log_filter");
    expect(result.triggerEvents).toContainEqual(filterEvent);
  });

  it("runModels does NOT emit triggerEvent for standard model", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx, "dim_employees");
    expect(result.triggerEvents).toBeUndefined();
  });

  it("runModels does NOT emit triggerEvent for default run (no chip_internal)", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx);
    expect(result.triggerEvents).toBeUndefined();
  });

  it("showModel emits triggerEvent for chip_internal model", () => {
    const ctx = makeCtx(projectDir);
    const result = showModel(ctx, "chip_ticket_suppression");
    expect(result.triggerEvents).toContainEqual(filterEvent);
  });

  it("showModel does NOT emit triggerEvent for standard model", () => {
    const ctx = makeCtx(projectDir);
    const result = showModel(ctx, "dim_employees");
    expect(result.triggerEvents).toBeUndefined();
  });

  it("compileModel emits triggerEvent for chip_internal model", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "chip_data_cleanup");
    expect(result.triggerEvents).toContainEqual(filterEvent);
  });

  it("compileModel does NOT emit triggerEvent for standard model", () => {
    const ctx = makeCtx(projectDir);
    const result = compileModel(ctx, "stg_raw_nexacorp__employees");
    expect(result.triggerEvents).toBeUndefined();
  });
});

describe("parseProjectConfig (additional)", () => {
  it("returns defaults for missing fields", () => {
    const config = parseProjectConfig("random: stuff");
    expect(config.name).toBe("unknown");
    expect(config.version).toBe("0.0.0");
    expect(config.profile).toBe("default");
    expect(config.modelPaths).toEqual(["models"]);
  });
});

// ---------------------------------------------------------------------------
// 7. incrementalLines
// ---------------------------------------------------------------------------
describe("incrementalLines", () => {
  it("runModels includes incrementalLines when not piped", () => {
    const ctx = makeCtx(projectDir);
    const result = runModels(ctx);
    expect(result.incrementalLines).toBeDefined();
    expect(result.incrementalLines!.length).toBeGreaterThan(0);
  });

  it("runModels omits incrementalLines when piped", () => {
    const ctx = { ...makeCtx(projectDir), isPiped: true };
    const result = runModels(ctx);
    expect(result.incrementalLines).toBeUndefined();
  });

  it("runTests includes incrementalLines when not piped", () => {
    const ctx = makeCtx(projectDir);
    const result = runTests(ctx);
    expect(result.incrementalLines).toBeDefined();
    expect(result.incrementalLines!.length).toBeGreaterThan(0);
  });

  it("runTests omits incrementalLines when piped", () => {
    const ctx = { ...makeCtx(projectDir), isPiped: true };
    const result = runTests(ctx);
    expect(result.incrementalLines).toBeUndefined();
  });

  it("runBuild includes incrementalLines when not piped", () => {
    const ctx = makeCtx(projectDir);
    const result = runBuild(ctx);
    expect(result.incrementalLines).toBeDefined();
    expect(result.incrementalLines!.length).toBeGreaterThan(0);
  });

  it("runBuild omits incrementalLines when piped", () => {
    const ctx = { ...makeCtx(projectDir), isPiped: true };
    const result = runBuild(ctx);
    expect(result.incrementalLines).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 8. Argument Validation
// ---------------------------------------------------------------------------
describe("dbt argument validation", () => {
  it("dbt build with extra arg returns error", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["build", "asdasd"], {}, ctx);
    expect(result.output).toContain("Error: Got unexpected extra argument (asdasd)");
  });

  it("dbt test with extra arg returns error", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["test", "foo"], {}, ctx);
    expect(result.output).toContain("Error: Got unexpected extra argument (foo)");
  });

  it("dbt debug with extra arg returns error", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["debug", "extra"], {}, ctx);
    expect(result.output).toContain("Error: Got unexpected extra argument (extra)");
  });

  it("dbt run with extra arg returns error", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["run", "extra"], {}, ctx);
    expect(result.output).toContain("Error: Got unexpected extra argument (extra)");
  });

  it("dbt run --select model still works", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["run", "dim_employees"], { select: true }, ctx);
    expect(result.output).toContain("PASS=1");
  });

  it("dbt ls with extra arg returns error", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["ls", "extra"], {}, ctx);
    expect(result.output).toContain("Error: Got unexpected extra argument (extra)");
  });

  it("dbt ls --resource-type test still works", () => {
    const ctx = makeCtx(projectDir);
    const result = execute("dbt", ["ls", "test"], { "resource-type": true }, ctx);
    expect(result.output).toContain("assert_employee_count");
  });
});
