import { CommandHandler, IncrementalLine } from "../types";
import { register } from "../registry";
import { colorize, ansi } from "../../../lib/ansi";

const WORKSPACE_NAME = "ai";

function usageOutput(): string {
  const lines = [
    `${colorize("coder", ansi.bold)} — Remote development environments`,
    "",
    `${colorize("USAGE:", ansi.bold)}`,
    "  coder <subcommand> [options]",
    "",
    `${colorize("SUBCOMMANDS:", ansi.bold)}`,
    "  list          List workspaces",
    "  start <name>  Start a workspace",
    "  stop <name>   Stop a workspace",
    "  ssh <name>    SSH into a workspace",
    "  logs <name>   Show workspace build logs",
    "  create        Create a new workspace",
    "  delete        Delete a workspace",
  ];
  return lines.join("\n");
}

function validateWorkspace(name: string): string | null {
  if (name !== WORKSPACE_NAME) {
    return `coder: workspace '${name}' not found\n\nAvailable workspaces:\n  ${WORKSPACE_NAME}    Data engineering environment`;
  }
  return null;
}

function isStopped(storyFlags?: Record<string, string | boolean>): boolean {
  return storyFlags?.coder_workspace_stopped === true;
}

const coder: CommandHandler = (args, _flags, ctx) => {
  if (ctx.activeComputer !== "nexacorp") {
    return { output: "coder: command not available outside NexaCorp" };
  }

  const sub = args[0];

  if (!sub) {
    return { output: usageOutput() };
  }

  switch (sub) {
    case "list":
    case "ls": {
      const status = isStopped(ctx.storyFlags)
        ? colorize("Stopped", ansi.red)
        : colorize("Running", ansi.green);
      const lines = [
        `${colorize("WORKSPACE", ansi.bold + ansi.dim)}  ${colorize("STATUS", ansi.bold + ansi.dim)}   ${colorize("TEMPLATE", ansi.bold + ansi.dim)}    ${colorize("LAST BUILT", ansi.bold + ansi.dim)}`,
        `${WORKSPACE_NAME}         ${status}   devcontainer   2h ago`,
      ];
      return { output: lines.join("\n") };
    }

    case "start": {
      const name = args[1];
      if (!name) {
        return { output: "usage: coder start <workspace>", exitCode: 1 };
      }
      const err = validateWorkspace(name);
      if (err) return { output: err, exitCode: 1 };

      if (!isStopped(ctx.storyFlags)) {
        return { output: `workspace "${WORKSPACE_NAME}" is already running` };
      }

      const lines: IncrementalLine[] = [
        { text: colorize(`Starting workspace "${WORKSPACE_NAME}"...`, ansi.dim), delayMs: 0 },
        { text: colorize("⧗ Waiting for workspace agent...", ansi.dim), delayMs: 400 },
        { text: colorize("⧗ Starting workspace agent...", ansi.dim), delayMs: 400 },
        { text: colorize("⧗ Running startup scripts...", ansi.dim), delayMs: 300 },
        { text: colorize("✓ Workspace agent connected", ansi.green), delayMs: 200 },
        { text: `\nWorkspace "${WORKSPACE_NAME}" is now ${colorize("running", ansi.green)}.`, delayMs: 0 },
      ];
      return {
        output: "",
        incrementalLines: lines,
        triggerEvents: [{ type: "command_executed", detail: "coder_start" }],
      };
    }

    case "stop": {
      const name = args[1];
      if (!name) {
        return { output: "usage: coder stop <workspace>", exitCode: 1 };
      }
      const err = validateWorkspace(name);
      if (err) return { output: err, exitCode: 1 };

      if (isStopped(ctx.storyFlags)) {
        return { output: `workspace "${WORKSPACE_NAME}" is already stopped` };
      }

      return {
        output: `Stopping workspace "${WORKSPACE_NAME}"...\n${colorize("✓ Workspace stopped", ansi.green)}`,
        triggerEvents: [{ type: "command_executed", detail: "coder_stop" }],
        closeTabsForComputer: "devcontainer",
      };
    }

    case "ssh": {
      if (args.length < 2) {
        return { output: "usage: coder ssh <workspace>\n\nAvailable workspaces:\n  ai    Data engineering environment" };
      }
      const name = args[1];
      const err = validateWorkspace(name);
      if (err) return { output: err, exitCode: 1 };

      if (isStopped(ctx.storyFlags)) {
        return {
          output: `workspace "${WORKSPACE_NAME}" is stopped\n\nStart it with: coder start ${WORKSPACE_NAME}`,
          exitCode: 1,
        };
      }

      return { output: "", transitionTo: "devcontainer" };
    }

    case "logs": {
      const name = args[1];
      if (!name) {
        return { output: "usage: coder logs <workspace>", exitCode: 1 };
      }
      const err = validateWorkspace(name);
      if (err) return { output: err, exitCode: 1 };

      const lines = [
        colorize("=== Build logs for workspace \"ai\" ===", ansi.bold),
        "",
        colorize("[2025-03-15 09:12:33]", ansi.dim) + " Pulling devcontainer image...",
        colorize("[2025-03-15 09:12:35]", ansi.dim) + " Image: ghcr.io/nexacorp/data-eng:latest",
        colorize("[2025-03-15 09:12:35]", ansi.dim) + " Digest: sha256:a1b2c3d4e5f6...",
        colorize("[2025-03-15 09:12:36]", ansi.dim) + " Starting container...",
        colorize("[2025-03-15 09:12:37]", ansi.dim) + " Installing extensions: ms-python.python, dbt-labs.dbt",
        colorize("[2025-03-15 09:12:38]", ansi.dim) + " Running postCreateCommand: pip install dbt-snowflake",
        colorize("[2025-03-15 09:12:40]", ansi.dim) + " Configuring Snowflake credentials...",
        colorize("[2025-03-15 09:12:41]", ansi.dim) + " Agent connected successfully",
        colorize("[2025-03-15 09:12:41]", ansi.dim) + " Startup script completed in 8.2s",
        "",
        colorize("✓ Build completed successfully", ansi.green),
      ];
      return { output: lines.join("\n") };
    }

    case "create": {
      return {
        output: colorize("Error: ", ansi.red) + "You don't have permission to create workspaces.\nContact your Coder admin for access.",
        exitCode: 1,
      };
    }

    case "delete": {
      return {
        output: colorize("Error: ", ansi.red) + "You don't have permission to delete workspaces.\nContact your Coder admin for access.",
        exitCode: 1,
      };
    }

    default:
      return { output: `coder: unknown subcommand '${sub}'\n\n${usageOutput()}`, exitCode: 1 };
  }
};

register("coder", coder, "Remote development environments on Coder");
