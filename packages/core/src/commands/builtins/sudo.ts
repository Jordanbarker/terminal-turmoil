import { CommandHandler } from "@tt/core/commands/types";
import { register, execute } from "../registry";
import { rejectUnknownFlags, skipFlagValidation, KnownFlags } from "../flagValidation";
import { splitArgsAndFlags } from "@tt/core/commands/parser";
import { HELP_TEXTS } from "./helpTexts";

/**
 * -i / -s ask real sudo for a root shell. There is no shell-in-a-shell here,
 * so they are accepted and ignored: `sudo -i apt update` runs elevated and a
 * bare `sudo -i` prints the usage line.
 */
const SUDO_FLAGS: KnownFlags = { short: ["i", "s"] };

const USAGE = "usage: sudo command [arg ...]";

const sudo: CommandHandler = (args, flags, ctx) => {
  // sudo owns only the flags typed BEFORE the command name; everything from the
  // command name onward belongs to the command being elevated. The parser can't
  // make that split (it hoists every flag on the line to the top level, so
  // `sudo apt install -y tree` arrives with `-y` looking like one of sudo's),
  // so walk the raw argv here and hand the tail over verbatim.
  const rawArgs = ctx.rawArgs;

  if (!rawArgs) {
    // No raw argv (a hand-built context). Fall back to the parsed form: flags
    // still pass through, minus the ones sudo itself claims.
    if (args.length === 0) return { output: USAGE };
    const [name, ...rest] = args;
    const passthrough = Object.fromEntries(
      Object.entries(flags).filter(([flag]) => !(SUDO_FLAGS.short ?? []).includes(flag)),
    );
    return execute(name, rest, passthrough, { ...ctx, elevated: true, rawArgs: rest });
  }

  let i = 0;
  while (i < rawArgs.length && rawArgs[i].startsWith("-") && rawArgs[i].length > 1) {
    const err = rejectUnknownFlags("sudo", splitArgsAndFlags([rawArgs[i]]).flags, SUDO_FLAGS);
    if (err) return err;
    i++;
  }

  const commandLine = rawArgs.slice(i);
  if (commandLine.length === 0) {
    return { output: USAGE };
  }

  const [name, ...tail] = commandLine;
  const sub = splitArgsAndFlags(tail);
  // The sub-command's `rawArgs` has to be its own tail as well: the
  // rawArgs-driven builtins (find, head, tail, tree, tmux) re-parse it, and
  // would otherwise re-read sudo's argv, command name and all.
  return execute(name, sub.args, sub.flags, { ...ctx, elevated: true, rawArgs: tail });
};

register("sudo", sudo, "Execute a command with elevated privileges", HELP_TEXTS.sudo);
// Validates its own leading flags in-handler so the elevated command's flags
// (`sudo apt install -y tree`) survive to the re-dispatch.
skipFlagValidation("sudo");
