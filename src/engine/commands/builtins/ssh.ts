import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolveSshTarget } from "../../ssh/sshConfig";
import { resolvePath } from "../../../lib/pathUtils";

const NEXACORP_HOST = "nexacorp-ws01.nexacorp.internal";

const ssh: CommandHandler = (args, _flags, ctx) => {
  if (args.length === 0) {
    return { output: "usage: ssh [user@]hostname" };
  }

  if (ctx.activeComputer !== "home") {
    return { output: `ssh: connect to host ${args[0]}: Connection refused` };
  }

  const target = args[0];

  // Read ~/.ssh/config for alias resolution
  const configPath = resolvePath(".ssh/config", ctx.homeDir, ctx.homeDir);
  const configResult = ctx.fs.readFile(configPath);
  const configContent = configResult.content;

  const resolved = resolveSshTarget(target, configContent);
  if (!resolved) {
    return { output: `ssh: Could not resolve hostname ${target}` };
  }

  if (resolved.host !== NEXACORP_HOST) {
    return { output: `ssh: Could not resolve hostname "${resolved.host}": Name or service not known` };
  }

  if (!resolved.user) {
    return { output: `ssh: Could not resolve hostname ${target}` };
  }

  return {
    output: "",
    sshSession: { host: resolved.host, username: resolved.user },
  };
};

register("ssh", ssh, "Connect to a remote host via SSH");
