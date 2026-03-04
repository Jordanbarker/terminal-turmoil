import { CommandHandler } from "../types";
import { register } from "../registry";

const INSTALLABLE_PACKAGES: Record<string, {
  flag: string;
  output: string;
  alreadyInstalled: string;
}> = {
  tree: {
    flag: "tree_installed",
    output: [
      "Reading package lists... Done",
      "Building dependency tree... Done",
      "Reading state information... Done",
      "The following NEW packages will be installed:",
      "  tree",
      "0 upgraded, 1 newly installed, 0 to remove and 0 not upgraded.",
      "Selecting previously unselected package tree.",
      "Setting up tree (2.1.1-1) ...",
    ].join("\n"),
    alreadyInstalled: "tree is already the newest version (2.1.1-1).\n0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.",
  },
};

const apt: CommandHandler = (args, _flags, ctx) => {
  if (!ctx.elevated) {
    return {
      output: "E: Could not open lock file - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock, are you root?",
    };
  }

  if (args.length === 0 || (args[0] !== "install")) {
    return { output: "Usage: apt install <package>" };
  }

  if (args.length < 2) {
    return { output: "E: No packages specified" };
  }

  const packageName = args[1];
  const pkg = INSTALLABLE_PACKAGES[packageName];

  if (!pkg) {
    return { output: `E: Unable to locate package ${packageName}` };
  }

  if (ctx.storyFlags?.[pkg.flag]) {
    return { output: pkg.alreadyInstalled };
  }

  return {
    output: pkg.output,
    triggerEvents: [{ type: "command_executed", detail: `apt_install_${packageName}` }],
  };
};

register("apt", apt, "Package manager");
