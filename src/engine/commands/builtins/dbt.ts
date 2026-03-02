import { CommandHandler } from "../types";
import { register } from "../registry";
import { HELP_TEXTS } from "./helpTexts";
import {
  runModels,
  runTests,
  runBuild,
  listResources,
  debugProject,
  compileModel,
  showModel,
} from "../../dbt/runner";
import { formatVersion, formatUsage } from "../../dbt/output";

const dbt: CommandHandler = (args, flags, ctx) => {
  const subcommand = args[0];

  // dbt --version (parsed as flag by parser)
  if (flags["version"]) {
    return { output: formatVersion() };
  }

  if (!subcommand) {
    return { output: formatUsage() };
  }

  // --select: parser makes it a boolean flag, model name goes into args
  // e.g. "dbt run --select dim_employees" → args=["run","dim_employees"], flags={select:true}
  const selectedModel = flags["select"] ? args[1] : undefined;

  switch (subcommand) {
    case "run":
      return runModels(ctx, selectedModel);

    case "test":
      return runTests(ctx);

    case "build":
      return runBuild(ctx);

    case "ls":
    case "list": {
      const resourceType = flags["resource-type"] ? args[1] : undefined;
      return listResources(ctx, resourceType);
    }

    case "debug":
      return debugProject(ctx);

    case "compile":
      return compileModel(ctx, selectedModel);

    case "show":
      return showModel(ctx, selectedModel);

    case "help":
      return { output: HELP_TEXTS.dbt };

    default:
      return { output: `Unknown dbt command '${subcommand}'.\n\n${formatUsage()}` };
  }
};

register("dbt", dbt, "dbt — data build tool for NexaCorp analytics", HELP_TEXTS.dbt);
