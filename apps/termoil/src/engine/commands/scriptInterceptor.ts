import { CommandResult } from "@tt/core/commands/types";
import { setScriptInterceptor } from "@tt/core/commands/scriptInterceptors";
import { colorize, ansi } from "@tt/core/lib/ansi";

/**
 * ~/scripts/auto_apply.py is the player's own job-application bot. It is
 * narrative set dressing, not real Python, so running it (via `python`, `bash`,
 * or `./auto_apply.py`) yields this authored transcript instead of going to
 * Pyodide. Registered through the core script-interception seam so the engine
 * itself carries no knowledge of the script.
 */
function simulateAutoApply(scriptArgs: string[]): CommandResult {
  const triggerEvents = [{ type: "command_executed" as const, detail: "ran_auto_apply" }];

  if (scriptArgs.includes("--status")) {
    const output = [
      "auto_apply.py: Application Status Report",
      "==========================================",
      "",
      "Total applications:  47",
      "  Pending:           31",
      "  Viewed:             9",
      "  Rejected:           5",
      "  Interview:          2",
      "",
      `Response rate: ${colorize("4.3%", ansi.yellow)} (industry avg: 8-12%)`,
      "",
      "Recent activity:",
      `  Cascade Analytics      Viewed       2 days ago`,
      `  NexaCorp               ${colorize("Interview", ansi.green)}    1 day ago`,
      `  Prometheus AI          Rejected     3 days ago`,
      `  Orion Data             Pending      5 days ago`,
      `  CortexLab              Pending      1 week ago`,
    ].join("\n");
    return { output, triggerEvents };
  }

  if (scriptArgs.includes("--dry-run")) {
    const output = [
      "[DRY RUN] auto_apply.py starting...",
      "[DRY RUN] Loading config from ~/.config/auto_apply/config.yaml",
      "[DRY RUN] Keywords: AI engineer, ML engineer, machine learning",
      "[DRY RUN] Max pages: 5",
      "",
      "[DRY RUN] Scraping indeed.com... found 12 listings",
      "[DRY RUN] Scraping linkedin.com... found 8 listings",
      "[DRY RUN] Scraping glassdoor.com... found 3 listings",
      "",
      "[DRY RUN] Would apply to 23 positions (use without --dry-run to submit)",
    ].join("\n");
    return { output, triggerEvents };
  }

  const output = [
    "auto_apply.py starting...",
    "Loading config from ~/.config/auto_apply/config.yaml",
    "Keywords: AI engineer, ML engineer, machine learning",
    "",
    "Scraping indeed.com... found 12 listings",
    "Scraping linkedin.com... found 8 listings",
    "Scraping glassdoor.com... found 3 listings",
    "",
    "Applying to 23 positions...",
    `  [1/23] Cascade Analytics, ML Engineer ............ ${colorize("sent", ansi.green)}`,
    `  [2/23] NexaCorp, AI Engineer ..................... ${colorize("sent", ansi.green)}`,
    `    ${colorize("⚠ Warning: NexaCorp has 2.6★ rating (3 reviews)", ansi.yellow)}`,
    `  [3/23] Prometheus AI, Head of AI Strategy ........ ${colorize("skipped (requires 10+ yrs)", ansi.dim)}`,
    `  [4/23] Orion Data, Senior ML Engineer ............ ${colorize("sent", ansi.green)}`,
    `  [5/23] CortexLab, Research Engineer .............. ${colorize("sent", ansi.green)}`,
    "  ...",
    `  [23/23] DataForge, Junior Data Scientist ......... ${colorize("sent", ansi.green)}`,
    "",
    "Done. Applied to 19/23 positions.",
    "Results saved to ~/scripts/data/applications.log",
  ].join("\n");
  return { output, triggerEvents };
}

setScriptInterceptor((absPath, scriptArgs, ctx) =>
  ctx.activeComputer === "home" && absPath.endsWith("/auto_apply.py")
    ? simulateAutoApply(scriptArgs)
    : null
);
