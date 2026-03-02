import { CommandResult, EditorSessionInfo, GameAction, SshSessionInfo } from "./types";
import { VirtualFS } from "../filesystem/VirtualFS";
import { checkEmailDeliveries, GameEvent } from "../mail/delivery";
import { resolvePath } from "../../lib/pathUtils";
import { getStoryFlagTriggers, getNexacorpStoryFlagTriggers, checkStoryFlagTriggers } from "../narrative/storyFlags";
import { PromptSessionInfo } from "../prompt/types";
import { ComputerId, StoryFlags } from "../../state/types";
import { colorize, ansi } from "../../lib/ansi";
import { listSaveSlots, formatSlotName } from "../../state/saveManager";

export type SessionToStart =
  | { type: "editor"; info: EditorSessionInfo }
  | { type: "snowsql" }
  | { type: "pythonRepl" }
  | { type: "prompt"; info: PromptSessionInfo }
  | { type: "ssh"; info: SshSessionInfo };

export interface StoryFlagUpdate {
  flag: string;
  value: string | boolean;
}

export interface AppliedEffects {
  clearScreen: boolean;
  output: string;
  newFs?: VirtualFS;
  newCwd?: string;
  startSession?: SessionToStart;
  gameAction?: GameAction;
  events: GameEvent[];
  storyFlagUpdates: StoryFlagUpdate[];
  newDeliveredEmailIds: string[];
  emailNotifications: number;
  suppressPrompt: boolean;
}

export interface ApplyContext {
  parsedCommand: string;
  parsedArgs: string[];
  cwd: string;
  homeDir: string;
  activeComputer: ComputerId;
  username: string;
  deliveredEmailIds: string[];
  storyFlags: StoryFlags;
  fs: VirtualFS;
}

/**
 * Pure function that computes what effects a CommandResult should produce.
 * Does not touch the terminal or React state — the caller executes the effects.
 */
export function computeEffects(
  result: CommandResult,
  applyCtx: ApplyContext
): AppliedEffects {
  const effects: AppliedEffects = {
    clearScreen: !!result.clearScreen,
    output: result.output || "",
    events: [],
    storyFlagUpdates: [],
    newDeliveredEmailIds: [],
    emailNotifications: 0,
    suppressPrompt: false,
  };

  // FS and cwd updates
  let currentFs = applyCtx.fs;

  if (result.newFs) {
    currentFs = result.newFs;
    effects.newFs = result.newFs;
  }

  if (result.newCwd) {
    currentFs = new VirtualFS(currentFs.root, result.newCwd, currentFs.homeDir);
    effects.newFs = currentFs;
    effects.newCwd = result.newCwd;
  }

  // Session starts
  if (result.editorSession) {
    effects.startSession = { type: "editor", info: result.editorSession };
    effects.suppressPrompt = true;
    return effects;
  }

  if (result.snowsqlSession?.startInteractive) {
    effects.startSession = { type: "snowsql" };
    effects.suppressPrompt = true;
    return effects;
  }

  if (result.promptSession) {
    effects.startSession = { type: "prompt", info: result.promptSession };
    effects.suppressPrompt = true;
    return effects;
  }

  if (result.interactiveSession?.type === "pythonRepl") {
    effects.startSession = { type: "pythonRepl" };
    effects.suppressPrompt = true;
    return effects;
  }

  if (result.sshSession) {
    effects.startSession = { type: "ssh", info: result.sshSession };
    effects.suppressPrompt = true;
    return effects;
  }

  // Game actions
  if (result.gameAction) {
    effects.gameAction = result.gameAction;

    if (result.gameAction.type === "listSaves") {
      effects.output += computeListSavesOutput();
    } else if (result.gameAction.type === "newGame") {
      effects.suppressPrompt = true;
    } else if (result.gameAction.type === "save" || result.gameAction.type === "load") {
      effects.suppressPrompt = result.gameAction.type === "load";
    }
  }

  // Build event list
  const events: GameEvent[] = [
    { type: "command_executed", detail: applyCtx.parsedCommand },
  ];

  if (result.triggerEvents) {
    events.push(...result.triggerEvents);
  }

  // Commands that read files trigger file_read events
  const fileReadCommands = ["cat", "head", "tail", "grep", "diff", "wc", "sort", "uniq", "file", "pdftotext"];
  if (fileReadCommands.includes(applyCtx.parsedCommand)) {
    for (const arg of applyCtx.parsedArgs) {
      if (!arg.startsWith("-")) {
        const absPath = resolvePath(arg, applyCtx.cwd, applyCtx.homeDir);
        events.push({ type: "file_read", detail: absPath });
      }
    }
  }

  effects.events = events;

  // Process story flag triggers
  {
    const triggers = applyCtx.activeComputer === "home"
      ? getStoryFlagTriggers(applyCtx.username)
      : getNexacorpStoryFlagTriggers(applyCtx.username);
    let currentFlags = { ...applyCtx.storyFlags };

    for (const event of events) {
      const flagResult = checkStoryFlagTriggers(event, triggers, currentFlags);
      if (flagResult) {
        effects.storyFlagUpdates.push(flagResult);
        currentFlags = { ...currentFlags, [flagResult.flag]: flagResult.value };
      }
    }

    // Process edward_impression from mail -s trigger events (home PC only)
    if (applyCtx.activeComputer === "home") {
      for (const event of events) {
        if (event.type === "objective_completed" && event.detail.startsWith("edward_impression:")) {
          const impression = event.detail.split(":")[1];
          effects.storyFlagUpdates.push({ flag: "edward_impression", value: impression });
        }
      }
    }

    // NexaCorp investigation triggers: diff on .bak files
    if (applyCtx.activeComputer === "nexacorp" && applyCtx.parsedCommand === "diff") {
      const args = applyCtx.parsedArgs.filter((a) => !a.startsWith("-"));
      const hasBak = args.some((a) => a.includes(".bak"));
      const hasLog = args.some((a) => a.includes("system.log") && !a.includes(".bak"));
      if (hasBak && hasLog && !currentFlags["discovered_log_tampering"]) {
        effects.storyFlagUpdates.push({ flag: "discovered_log_tampering", value: true });
      }
    }
  }

  // Process email deliveries
  let deliveredIds = [...applyCtx.deliveredEmailIds];
  for (const event of events) {
    const delivery = checkEmailDeliveries(
      currentFs,
      event,
      deliveredIds,
      applyCtx.activeComputer
    );
    if (delivery.newDeliveries.length > 0) {
      currentFs = delivery.fs;
      effects.newFs = currentFs;
      deliveredIds = [...deliveredIds, ...delivery.newDeliveries];
      effects.newDeliveredEmailIds.push(...delivery.newDeliveries);
      effects.emailNotifications++;
    }

  }

  return effects;
}

function computeListSavesOutput(): string {
  const slots = listSaveSlots();
  const lines = [
    colorize("Save Slots:", ansi.bold + ansi.cyan),
    "",
  ];
  for (const slot of slots) {
    const label = formatSlotName(slot.slotId);
    if (slot.empty) {
      const indicator = colorize("○", ansi.dim);
      lines.push(`  ${indicator} ${colorize(label.padEnd(10), ansi.bold)}  ${colorize("(empty)", ansi.dim)}`);
    } else {
      const indicator = colorize("●", ansi.cyan);
      const chapterNum = slot.currentChapter.replace("chapter-", "");
      const chapterLabel = colorize(`Ch. ${chapterNum}`, ansi.dim);
      const date = new Date(slot.timestamp).toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      });
      lines.push(`  ${indicator} ${colorize(label.padEnd(10), ansi.bold)}  ${slot.label}  ${chapterLabel}  ${colorize(date, ansi.dim)}`);
    }
  }
  lines.push("");
  lines.push(`Use ${colorize("save 1|2|3", ansi.cyan)} or ${colorize("load 1|2|3|auto", ansi.cyan)}`);
  return lines.join("\n");
}
