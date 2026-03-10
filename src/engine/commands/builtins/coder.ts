import { CommandHandler } from "../types";
import { register } from "../registry";

const coder: CommandHandler = (args, _flags, ctx) => {
  if (ctx.activeComputer !== "nexacorp") {
    return { output: "coder: command not available outside NexaCorp" };
  }

  if (args.length === 0 || args[0] !== "ssh") {
    return { output: "usage: coder ssh <workspace>\n\nConnect to a Coder dev container.\n\nAvailable workspaces:\n  ai    Data engineering environment (dbt, snowsql, python)" };
  }

  if (args.length < 2) {
    return { output: "usage: coder ssh <workspace>\n\nAvailable workspaces:\n  ai    Data engineering environment" };
  }

  const workspace = args[1];
  if (workspace !== "ai") {
    return { output: `coder: workspace '${workspace}' not found\n\nAvailable workspaces:\n  ai    Data engineering environment` };
  }

  return { output: "", transitionTo: "devcontainer" };
};

register("coder", coder, "Connect to a Coder dev container");
