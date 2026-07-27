#!/usr/bin/env npx tsx
/**
 * Headless Game Runner for Termoil.
 *
 * Replicates the game loop from useTerminal.ts without xterm.js or a browser.
 * Run: npx tsx scripts/play.ts
 */

// Must mock localStorage BEFORE any imports that use it
const storage = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v); },
  removeItem: (k: string) => { storage.delete(k); },
  clear: () => storage.clear(),
  get length() { return storage.size; },
  key: (i: number) => [...storage.keys()][i] ?? null,
} as Storage;

// Engine imports (no React/Zustand dependency)
import { parseChainedPipeline, parseInput, expandAliases } from "@tt/core/commands/parser";
import { execute, executeAsync, isAsyncCommand, commandReadsFiles } from "@tt/core/commands/registry";
import { isChainEarlyReturn } from "@tt/core/commands/runPipeline";
import "../src/engine/commands/builtins"; // side-effect: registers all commands
import { computeEffects, SessionToStart } from "@tt/core/commands/applyResult";
import { processDeliveries } from "../src/engine/commands/processDeliveries";
import { createDeviceProvider } from "../src/story/blockDevices";
import { createGameClock } from "../src/story/clock";
import { NEXACORP_SECURITY_POLICY, SecurityViolation } from "../src/story/security";
import { STANDARD_MODEL_ORDER } from "@/story/data/dbt/data";
import { renderSavesList, renderCheckpointsList } from "../src/story/listingOutput";
import { CHECKPOINTS, Checkpoint } from "../src/story/checkpoints";
import { GameAction } from "@tt/core/commands/types";
import {
  buildFs, createSaveData, loadFromSlot, restoreGameState, saveToSlot,
  formatSlotName, SaveableState, RestoredGameState,
} from "../src/state/saveManager";
import { SaveSlotId, SAVE_FORMAT_VERSION } from "../src/state/saveTypes";
import { syncToVirtualFS } from "@tt/core/snowflake/bridge/fs_bridge";
import { makeWindow, allLeaves } from "@tt/core/terminal/paneTypes";
import { CommandResult, ChainSegment, ParsedCommand } from "@tt/core/commands/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { createHomeFilesystem } from "../src/story/filesystem/home";
import { createNexacorpFilesystem } from "../src/story/filesystem/nexacorp";
import { createDevcontainerFilesystem } from "../src/story/filesystem/devcontainer";
import { createChipinfraFilesystem } from "../src/story/filesystem/chipinfra";
import { createErikpcFilesystem } from "../src/story/filesystem/erikpc";
import { getComputerUsername } from "../src/story/player";
import { initEnvForComputer, initAliasesForComputer } from "../src/story/env";
import { Mounts } from "@tt/core/filesystem/mounts";
import { SnowflakeState } from "@tt/core/snowflake/state";
import { createInitialSnowflakeState } from "@/story/data/snowflake/initial_data";
import "../src/story/git/remotes"; // side effect: registers this story's clonable git remotes into @tt/core
// Side effect: registers termoil's command gates. Without it the engine's
// allow-all default applies and the runner would run commands the player
// hasn't unlocked yet (registry.execute consults the policy with ctx.storyFlags).
import "../src/story/availabilityPolicy";
import { createDefaultContext, SessionContext } from "@tt/core/snowflake/session/context";
import { checkEmailDeliveries, GameEvent } from "../src/engine/mail/delivery";
import { checkStoryFlagTriggers, getTriggersForComputer } from "../src/engine/narrative/storyFlags";
import { getSentDir } from "../src/engine/mail/mailUtils";
import { resolvePath } from "@tt/core/lib/pathUtils";
import { extractStdoutRedirect, applyRedirection, precheckRedirects, RedirectTarget } from "@tt/core/commands/redirection";
import { PromptSessionInfo } from "../src/engine/prompt/types";
import { ComputerId, StoryFlags, PLAYER, COMPUTERS } from "../src/state/types";
import { colorize, ansi, stripAnsi } from "@tt/core/lib/ansi";
import { parseZshHistory } from "@tt/core/terminal/zshHistory";
import { execSync } from "child_process";

// ── Types ───────────────────────────────────────────────────────────

interface CommandOutput {
  output: string;
  rawOutput: string;
  exitCode: number;
  events: GameEvent[];
  storyFlagUpdates: Array<{ flag: string; value: string | boolean }>;
  newEmails: string[];
  promptPending: boolean;
  sshSessionStarted: boolean;
  /** Machine the command routes to. The React app animates it; the runner only reports it. */
  transitionTo?: ComputerId;
  /** Set when a security tripwire fired (forces transitionTo home in the real game). */
  terminationReason?: SecurityViolation;
}

// Mirrors the map of the same name in src/hooks/useTerminal.ts (module-private
// there, so it cannot be imported). Nothing enforces the copy automatically:
// the only guard is playtest_git.ts, which asserts the full `git log` author
// line (display name + username + this domain) on the devcontainer. Change one
// map, change the other, and re-run `npm -w @tt/termoil run playtest:git`.
const GIT_AUTHOR_EMAIL_DOMAIN: Record<ComputerId, string> = {
  home: "maniac-iv.local",
  nexacorp: "nexacorp.com",
  devcontainer: "nexacorp.com",
  chipinfra: "nexacorp.com",
  "erik-pc": "nexacorp.com",
};

// ── GameRunner ──────────────────────────────────────────────────────

export class GameRunner {
  fs: VirtualFS;
  cwd: string;
  username: string;
  activeComputer: ComputerId;
  storyFlags: StoryFlags;
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  commandHistory: Record<ComputerId, string[]>;
  snowflakeState: SnowflakeState;
  snowflakeContext: SessionContext;
  completedObjectives: string[];
  /** Store parity: `save`/`cheat` carry it, nothing headless advances it. */
  currentChapter: string;
  pendingPrompt: PromptSessionInfo | null;
  /** Set by a load/cheat/newgame gameAction; consumed by appendZshHistory. */
  private stateReloaded: boolean;
  envVars: Partial<Record<ComputerId, Record<string, string>>>;
  aliases: Partial<Record<ComputerId, Record<string, string>>>;
  mounts: Record<ComputerId, Mounts>;

  constructor(computer: ComputerId = "home") {
    this.username = PLAYER.username;
    this.activeComputer = computer;
    this.storyFlags = {};
    this.deliveredEmailIds = [];
    this.deliveredPiperIds = [];
    this.commandHistory = { home: [], nexacorp: [], devcontainer: [], chipinfra: [], "erik-pc": [] };
    this.snowflakeState = createInitialSnowflakeState();
    this.snowflakeContext = createDefaultContext(this.username);
    this.completedObjectives = [];
    this.currentChapter = "chapter-1";
    this.pendingPrompt = null;
    this.stateReloaded = false;
    this.envVars = {};
    this.aliases = {};
    this.mounts = { home: {}, nexacorp: {}, devcontainer: {}, chipinfra: {}, "erik-pc": {} };

    const root = computer === "home"
      ? createHomeFilesystem(this.username)
      : createNexacorpFilesystem(this.username, this.storyFlags);
    const homeDir = `/home/${this.username}`;
    this.fs = new VirtualFS(root, homeDir, homeDir);
    this.cwd = homeDir;
    this.envVars[computer] = initEnvForComputer(computer, this.username, this.fs);
    this.aliases[computer] = initAliasesForComputer(computer, this.username, this.fs);

    // Deliver immediate emails (baked into FS already via filesystem factories)
    // Track their IDs so they don't re-deliver
    this.syncImmediateEmailIds();
  }

  /** Scan the mail directory for already-delivered emails and record their IDs. */
  private syncImmediateEmailIds(): void {
    // The filesystem factories already place immediate emails in new/.
    // We don't track them as "delivered" since the delivery system skips
    // immediate triggers anyway — they use trigger.type === "immediate".
  }

  /**
   * Append a submitted line to the `.zsh_history` file (the single source of
   * truth for shell history), mirroring useTerminal.ts (HIST_IGNORE_DUPS).
   *
   * Skipped when the command replaced the whole game state (`load`, `cheat`,
   * `newgame`): the browser appends to the *pre-load* FS, so the loaded
   * machine's history must not gain the command that loaded it.
   */
  private appendZshHistory(input: string): void {
    if (this.stateReloaded) {
      this.stateReloaded = false;
      return;
    }
    const path = `${this.fs.homeDir}/.zsh_history`;
    const prev = this.fs.readFile(path).content ?? "";
    const lastLine = prev.trimEnd().split("\n").pop() ?? "";
    if (lastLine !== input) {
      const suffix = prev.endsWith("\n") || prev === "" ? "" : "\n";
      const w = this.fs.writeFile(path, prev + suffix + input + "\n");
      if (w.fs) this.fs = w.fs;
    }
  }

  /**
   * Execute a command string and return structured output.
   * Supports aliases, pipes, redirection, and `&&`/`||`/`;` chains
   * (mirrors useTerminal.ts). Async commands (python, dbt, snow) require runAsync().
   *
   * WHY THIS LOOP IS HAND-ROLLED instead of calling `@tt/core`'s `runPipeline`,
   * which useTerminal.ts uses. Keep the two in sync by hand — the copied bits
   * are `intermediateFileReads` + `finishSegment` below, plus the `&&`/`||`/`;`
   * operator gating, `prepareSegment`'s redirect-extract -> precheck ->
   * parseInput(stripped) ordering, the
   * `isPiped = pi < len-1 || redirects.length > 0` expression, and the
   * `stdin = stripAnsi(lastResult.output)` threading:
   *   1. `runPipeline` is `async`. `run()` cannot be, because the play scripts
   *      call it synchronously in hundreds of places.
   *   2. `runPipeline` owns the FS thread and hands it back only at the end,
   *      while the runner keeps one mutable `this.fs` that `applyEffects` also
   *      writes (delivery-cascade email files land there mid-chain). Adopting
   *      the threaded contract would mean either dropping those writes or
   *      dropping the redirect writes, the same collision useTerminal.ts
   *      resolves with two `setComputerFs` calls.
   */
  run(input: string): CommandOutput {
    this.commandHistory[this.activeComputer].push(input);
    const { chain, parseError, empty } = this.prepareChain(input);
    if (parseError) return this.parseErrorOutput(parseError);
    if (empty) return this.emptyOutput();

    let lastExitCode = 0;
    let merged: CommandOutput | null = null;

    for (const seg of chain) {
      if (seg.operator === "&&" && lastExitCode !== 0) continue;
      if (seg.operator === "||" && lastExitCode === 0) continue;
      // ';' and null (first): always execute

      const { result, lastParsed } = this.runSegmentPipelineSync(seg);
      lastExitCode = result.exitCode ?? 0;
      const segOut = this.applyEffects(result, lastParsed);
      merged = merged ? this.mergeOutputs(merged, segOut) : segOut;
      if (isChainEarlyReturn(result)) break;
    }

    this.appendZshHistory(input);
    const out = merged ?? this.emptyOutput();
    out.exitCode = lastExitCode;
    return out;
  }

  /** Run a command that may be async (e.g. dbt). Same chain semantics as run(). */
  async runAsync(input: string): Promise<CommandOutput> {
    this.commandHistory[this.activeComputer].push(input);
    const { chain, parseError, empty } = this.prepareChain(input);
    if (parseError) return this.parseErrorOutput(parseError);
    if (empty) return this.emptyOutput();

    let lastExitCode = 0;
    let merged: CommandOutput | null = null;

    for (const seg of chain) {
      if (seg.operator === "&&" && lastExitCode !== 0) continue;
      if (seg.operator === "||" && lastExitCode === 0) continue;

      const { result, lastParsed } = await this.runSegmentPipelineAsync(seg);
      lastExitCode = result.exitCode ?? 0;
      const segOut = this.applyEffects(result, lastParsed);
      merged = merged ? this.mergeOutputs(merged, segOut) : segOut;
      if (isChainEarlyReturn(result)) break;
    }

    this.appendZshHistory(input);
    const out = merged ?? this.emptyOutput();
    out.exitCode = lastExitCode;
    return out;
  }

  /** Alias-expand the input and parse it into chain segments, surfacing parse errors. */
  private prepareChain(input: string): { chain: ChainSegment[]; parseError?: string; empty: boolean } {
    const expanded = expandAliases(input, this.aliases[this.activeComputer] ?? {});
    const chain = parseChainedPipeline(expanded);
    const errCmd = chain.flatMap((seg) => seg.pipeline).find((p) => p.error);
    if (errCmd) return { chain, parseError: errCmd.error, empty: false };
    const empty = chain.length === 1 && chain[0].pipeline.length === 1 && !chain[0].pipeline[0].command;
    return { chain, empty };
  }

  private parseErrorOutput(error: string): CommandOutput {
    const raw = colorize(error, ansi.red);
    return { ...this.emptyOutput(), output: stripAnsi(raw), rawOutput: raw, exitCode: 2 };
  }

  private buildCtx(p: ParsedCommand, stdin: string | undefined, isPiped: boolean) {
    return {
      fs: this.fs,
      // Parity block: these four mirror buildCommandContext in
      // src/hooks/useTerminal.ts. Omitting any of them silently changes
      // behaviour (wall clock instead of game clock, alphabetical dbt model
      // order, no NexaCorp tripwires, no git author), so a headless run would
      // stop being evidence about the real game.
      clock: createGameClock(this.deliveredPiperIds, this.username, this.activeComputer),
      dbtModelOrder: STANDARD_MODEL_ORDER,
      security: this.activeComputer === "nexacorp" ? NEXACORP_SECURITY_POLICY : undefined,
      gitAuthor: `${PLAYER.displayName} <${this.username}@${GIT_AUTHOR_EMAIL_DOMAIN[this.activeComputer]}>`,
      cwd: this.cwd,
      homeDir: this.fs.homeDir,
      username: this.username,
      activeComputer: this.activeComputer,
      storyFlags: this.storyFlags,
      stdin,
      rawArgs: p.rawArgs,
      isPiped,
      commandHistory: parseZshHistory(this.fs.readFile(`${this.fs.homeDir}/.zsh_history`).content ?? ""),
      snowflakeState: this.snowflakeState,
      snowflakeContext: this.snowflakeContext,
      setSnowflakeState: (state: SnowflakeState) => { this.snowflakeState = state; },
      deliveredPiperIds: this.deliveredPiperIds,
      envVars: this.envVars[this.activeComputer]!,
      setEnvVars: (env: Record<string, string>) => { this.envVars[this.activeComputer] = env; },
      aliases: this.aliases[this.activeComputer]!,
      setAliases: (a: Record<string, string>) => { this.aliases[this.activeComputer] = a; },
      mounts: this.mounts[this.activeComputer],
      setMounts: (m: Mounts) => { this.mounts[this.activeComputer] = m; },
      devices: createDeviceProvider(this.activeComputer, this.storyFlags),
      setCwd: (newCwd: string) => { this.cwd = newCwd; },
    };
  }

  /** Strip `>`/`>>` redirection from the last command of a segment's pipeline. */
  private prepareSegment(seg: ChainSegment) {
    const pipeline = [...seg.pipeline];
    const lastSegment = pipeline[pipeline.length - 1];
    const { command: stripped, redirects, parseError } =
      extractStdoutRedirect(lastSegment.raw);
    if (parseError) {
      return { pipeline, redirects, parseError };
    }
    if (redirects.length > 0) {
      const precheckError = precheckRedirects(redirects, this.cwd, this.fs.homeDir, this.fs);
      if (precheckError) {
        return { pipeline, redirects, parseError: precheckError };
      }
      pipeline[pipeline.length - 1] = parseInput(stripped);
    }
    return { pipeline, redirects, parseError: undefined };
  }

  /**
   * `file_read` events for a non-final piped command. This is runPipeline's
   * `intermediateFileReadEvents: true`, which useTerminal.ts passes: without it
   * `sort x.log | uniq -c` fires no story triggers headlessly even though it
   * does in the browser.
   */
  private intermediateFileReads(p: ParsedCommand): NonNullable<CommandResult["triggerEvents"]> {
    if (!commandReadsFiles(p.command)) return [];
    const events: NonNullable<CommandResult["triggerEvents"]> = [];
    for (const arg of p.args) {
      if (arg.startsWith("-")) continue;
      const absPath = resolvePath(arg, this.cwd, this.fs.homeDir);
      if (!this.fs.readFile(absPath).error) events.push({ type: "file_read", detail: absPath });
    }
    return events;
  }

  /** Execute one chain segment's pipeline synchronously. */
  private runSegmentPipelineSync(seg: ChainSegment): { result: CommandResult; lastParsed: ParsedCommand } {
    const { pipeline, redirects, parseError } = this.prepareSegment(seg);
    if (parseError) {
      // The command never runs (zsh opens redirect targets before exec)
      return {
        result: { output: parseError, exitCode: 1 },
        lastParsed: { command: "", args: [], flags: {}, raw: "", rawArgs: [] },
      };
    }

    let stdin: string | undefined; // reset per chain segment
    let lastResult: CommandResult = { output: "" };
    const allTriggerEvents: NonNullable<CommandResult["triggerEvents"]> = [];
    let pipelineViolation: CommandResult["securityViolation"];

    for (let pi = 0; pi < pipeline.length; pi++) {
      const p = pipeline[pi];
      if (!p.command) continue;

      const ctx = this.buildCtx(p, stdin, pi < pipeline.length - 1 || redirects.length > 0);

      const refusedAsync = isAsyncCommand(p.command);
      if (refusedAsync) {
        // Async commands (python, dbt, snow) require runAsync() — warn if called synchronously
        lastResult = { output: `${p.command}: use runAsync() for async commands`, exitCode: 1, triggerEvents: [] };
      } else {
        lastResult = execute(p.command, p.args, p.flags, ctx);
      }

      if (lastResult.triggerEvents) {
        allTriggerEvents.push(...lastResult.triggerEvents);
      }
      if (lastResult.securityViolation && !pipelineViolation) {
        pipelineViolation = lastResult.securityViolation;
      }
      // A refused async command never ran, so it read nothing.
      if (pi < pipeline.length - 1 && !refusedAsync) {
        allTriggerEvents.push(...this.intermediateFileReads(p));
      }

      // Apply FS changes mid-pipeline
      if (lastResult.newFs) {
        this.fs = lastResult.newFs;
      }
      if (lastResult.newMounts) {
        this.mounts[this.activeComputer] = lastResult.newMounts;
      }

      stdin = stripAnsi(lastResult.output);
    }

    lastResult = this.finishSegment(lastResult, allTriggerEvents, pipelineViolation, redirects);
    return { result: lastResult, lastParsed: pipeline[pipeline.length - 1] };
  }

  /**
   * Shared tail of both pipeline loops: fold accumulated events + the
   * first pipeline security violation into the result, then apply stdout
   * redirection (with the machine's security policy, so `> /var/log/...`
   * trips the log-tampering wire exactly as it does in the browser).
   */
  private finishSegment(
    lastResult: CommandResult,
    allTriggerEvents: NonNullable<CommandResult["triggerEvents"]>,
    pipelineViolation: CommandResult["securityViolation"],
    redirects: RedirectTarget[],
  ): CommandResult {
    let result = lastResult;
    if (allTriggerEvents.length > 0) {
      result = { ...result, triggerEvents: allTriggerEvents };
    }
    if (pipelineViolation && !result.securityViolation) {
      result = { ...result, securityViolation: pipelineViolation };
    }
    if (redirects.length > 0) {
      const r = applyRedirection(
        redirects, result,
        this.cwd, this.fs.homeDir, this.fs, this.activeComputer,
        this.activeComputer === "nexacorp" ? NEXACORP_SECURITY_POLICY : undefined,
      );
      result = r.result;
      this.fs = r.fs;
    }
    return result;
  }

  /** Execute one chain segment's pipeline, awaiting async commands. */
  private async runSegmentPipelineAsync(seg: ChainSegment): Promise<{ result: CommandResult; lastParsed: ParsedCommand }> {
    const { pipeline, redirects, parseError } = this.prepareSegment(seg);
    if (parseError) {
      // The command never runs (zsh opens redirect targets before exec)
      return {
        result: { output: parseError, exitCode: 1 },
        lastParsed: { command: "", args: [], flags: {}, raw: "", rawArgs: [] },
      };
    }

    let stdin: string | undefined;
    let lastResult: CommandResult = { output: "" };
    const allTriggerEvents: NonNullable<CommandResult["triggerEvents"]> = [];
    let pipelineViolation: CommandResult["securityViolation"];

    for (let pi = 0; pi < pipeline.length; pi++) {
      const p = pipeline[pi];
      if (!p.command) continue;

      const ctx = this.buildCtx(p, stdin, pi < pipeline.length - 1 || redirects.length > 0);

      if (isAsyncCommand(p.command)) {
        lastResult = await executeAsync(p.command, p.args, p.flags, ctx);
      } else {
        lastResult = execute(p.command, p.args, p.flags, ctx);
      }

      if (lastResult.triggerEvents) {
        allTriggerEvents.push(...lastResult.triggerEvents);
      }
      if (lastResult.securityViolation && !pipelineViolation) {
        pipelineViolation = lastResult.securityViolation;
      }
      if (pi < pipeline.length - 1) {
        allTriggerEvents.push(...this.intermediateFileReads(p));
      }

      if (lastResult.newFs) {
        this.fs = lastResult.newFs;
      }
      if (lastResult.newMounts) {
        this.mounts[this.activeComputer] = lastResult.newMounts;
      }

      stdin = stripAnsi(lastResult.output);
    }

    lastResult = this.finishSegment(lastResult, allTriggerEvents, pipelineViolation, redirects);
    return { result: lastResult, lastParsed: pipeline[pipeline.length - 1] };
  }

  /** Merge consecutive chain-segment outputs into one CommandOutput. */
  private mergeOutputs(acc: CommandOutput, next: CommandOutput): CommandOutput {
    return {
      output: [acc.output, next.output].filter(Boolean).join("\n"),
      rawOutput: [acc.rawOutput, next.rawOutput].filter(Boolean).join("\n"),
      exitCode: next.exitCode,
      events: [...acc.events, ...next.events],
      storyFlagUpdates: [...acc.storyFlagUpdates, ...next.storyFlagUpdates],
      newEmails: [...acc.newEmails, ...next.newEmails],
      promptPending: acc.promptPending || next.promptPending,
      sshSessionStarted: acc.sshSessionStarted || next.sshSessionStarted,
      transitionTo: next.transitionTo ?? acc.transitionTo,
      terminationReason: next.terminationReason ?? acc.terminationReason,
    };
  }

  /** Resolve a pending prompt by choosing option N (1-indexed). */
  selectOption(choice: number): CommandOutput {
    if (!this.pendingPrompt) {
      return { ...this.emptyOutput(), output: "No pending prompt.", rawOutput: "No pending prompt." };
    }

    const info = this.pendingPrompt;
    if (choice < 1 || choice > info.options.length) {
      return {
        ...this.emptyOutput(),
        output: `Invalid selection. Please enter 1-${info.options.length}.`,
        rawOutput: `Invalid selection. Please enter 1-${info.options.length}.`,
      };
    }

    const option = info.options[choice - 1];
    this.pendingPrompt = null;

    // Save reply email to sent/ if provided
    if (option.replyEmail) {
      const email = option.replyEmail;
      const filename = `sent_${Date.now()}`;
      const content = [
        `From: ${email.from}`,
        `To: ${email.to}`,
        `Date: ${email.date}`,
        `Subject: ${email.subject}`,
        "",
        email.body,
      ].join("\n");

      const result = this.fs.writeFile(`${getSentDir(this.username)}/${filename}`, content);
      if (result.fs) {
        this.fs = result.fs;
      }
    }

    const rawOutput = option.output ?? colorize("Reply sent.", ansi.green);
    const events: GameEvent[] = [];
    const storyFlagUpdates: Array<{ flag: string; value: string | boolean }> = [];
    const newEmails: string[] = [];

    // Fire the option's trigger events in useSessionRouter.processTriggerEvents
    // order: objectives, then ALL story-flag triggers, then email deliveries
    // (so deliveries see the flags this reply just set), then the piper cascade.
    // The piper half is NOT reproduced here: piper sessions aren't drivable
    // headlessly, so arcs simulate those unlocks (see simulatePiperUnlocks in
    // playtest_arcs.ts and the play-testing skill).
    if (option.triggerEvents) {
      events.push(...option.triggerEvents);

      for (const event of option.triggerEvents) {
        if (event.type === "objective_completed") this.completedObjectives.push(event.detail);
      }

      const triggers = getTriggersForComputer(this.activeComputer, this.username);
      for (const event of option.triggerEvents) {
        for (const update of checkStoryFlagTriggers(event, triggers, this.storyFlags)) {
          this.storyFlags = { ...this.storyFlags, [update.flag]: update.value };
          storyFlagUpdates.push({ flag: update.flag, value: update.value });
        }
      }

      for (const event of option.triggerEvents) {
        // storyFlags matters twice over: `after_story_flag` emails are filtered
        // out of the definition list without it, and the flags must already
        // carry this reply's updates from the pass above.
        const delivery = checkEmailDeliveries(
          this.fs,
          event,
          this.deliveredEmailIds,
          this.activeComputer,
          this.storyFlags
        );
        if (delivery.newDeliveries.length > 0) {
          this.fs = delivery.fs;
          this.deliveredEmailIds = [...this.deliveredEmailIds, ...delivery.newDeliveries];
          newEmails.push(...delivery.newDeliveries);
        }
      }
    }

    return {
      output: stripAnsi(rawOutput),
      rawOutput,
      exitCode: 0,
      events,
      storyFlagUpdates,
      newEmails,
      promptPending: false,
      sshSessionStarted: false,
    };
  }

  /** Write a file directly (replaces nano for headless use). */
  writeFile(path: string, content: string): void {
    const absPath = resolvePath(path, this.cwd, this.fs.homeDir);
    const result = this.fs.writeFile(absPath, content);
    if (result.fs) {
      this.fs = result.fs;
    }
  }

  /** Run Python code via child_process. */
  runPython(code: string): string {
    return execSync("python3", { input: code, encoding: "utf-8", timeout: 30000 }).trim();
  }

  /** Switch to a different computer (instant transition). */
  switchComputer(to: ComputerId): void {
    this.activeComputer = to;
    let root;
    switch (to) {
      case "home":
        root = createHomeFilesystem(this.username);
        break;
      case "devcontainer":
        root = createDevcontainerFilesystem(this.username, this.storyFlags);
        break;
      case "chipinfra":
        root = createChipinfraFilesystem(this.username, this.storyFlags);
        break;
      case "erik-pc":
        root = createErikpcFilesystem(this.username);
        break;
      default:
        root = createNexacorpFilesystem(this.username, this.storyFlags);
        break;
    }
    const shellUser = getComputerUsername(to, this.username);
    const homeDir = `/home/${shellUser}`;
    this.fs = new VirtualFS(root, homeDir, homeDir);
    this.cwd = homeDir;
    this.snowflakeState = createInitialSnowflakeState({ includeDay2: !!this.storyFlags.day1_shutdown });
    this.snowflakeContext = createDefaultContext(this.username);
    // First visit only — revisits keep env/aliases set via export/alias,
    // matching gameStore.initComputer (gated on absent computerState entry)
    if (!this.envVars[to]) this.envVars[to] = initEnvForComputer(to, this.username, this.fs);
    if (!this.aliases[to]) this.aliases[to] = initAliasesForComputer(to, this.username, this.fs);
  }

  /** Return a summary of the current game state. */
  status(): string {
    const hostname = COMPUTERS[this.activeComputer].promptHostname;
    const flagCount = Object.keys(this.storyFlags).length;
    const lines = [
      `Computer: ${this.activeComputer} (${hostname})`,
      `CWD: ${this.cwd}`,
      `Username: ${this.username}`,
      `Story flags: ${flagCount} set`,
      `Delivered emails: ${this.deliveredEmailIds.length}`,
      `Completed objectives: ${this.completedObjectives.length}`,
      `Command history: ${this.commandHistory[this.activeComputer].length} commands`,
      `Pending prompt: ${this.pendingPrompt ? "yes" : "no"}`,
    ];
    return lines.join("\n");
  }

  // ── Private ─────────────────────────────────────────────────────────

  private emptyOutput(): CommandOutput {
    return {
      output: "",
      rawOutput: "",
      exitCode: 0,
      events: [],
      storyFlagUpdates: [],
      newEmails: [],
      promptPending: false,
      sshSessionStarted: false,
    };
  }

  /** Compute and apply effects from a command result. */
  private applyEffects(result: CommandResult, parsedCmd: { command: string; args: string[] }): CommandOutput {
    const effects = computeEffects(result, {
      parsedCommand: parsedCmd.command,
      parsedArgs: parsedCmd.args,
      cwd: this.cwd,
      homeDir: this.fs.homeDir,
      activeComputer: this.activeComputer,
      username: this.username,
      deliveredEmailIds: this.deliveredEmailIds,
      deliveredPiperIds: this.deliveredPiperIds,
      storyFlags: this.storyFlags,
      fs: this.fs,
      securityHomeMachine: "home",
      processDeliveries,
      renderSavesList,
      renderCheckpointsList,
    });

    // Apply FS changes
    if (effects.newFs) {
      this.fs = effects.newFs;
    }
    if (effects.newCwd) {
      this.cwd = effects.newCwd;
    }

    // Apply story flag updates
    for (const update of effects.storyFlagUpdates) {
      this.storyFlags = { ...this.storyFlags, [update.flag]: update.value };
    }

    // Apply email deliveries
    if (effects.newDeliveredEmailIds.length > 0) {
      this.deliveredEmailIds = [...this.deliveredEmailIds, ...effects.newDeliveredEmailIds];
    }

    // Apply piper deliveries
    if (effects.newDeliveredPiperIds.length > 0) {
      this.deliveredPiperIds = [...this.deliveredPiperIds, ...effects.newDeliveredPiperIds];
    }

    // Build output
    let rawOutput = effects.output || "";

    // Handle sessions
    let promptPending = false;
    if (effects.startSession) {
      const sessionOutput = this.handleSessionStart(effects.startSession);
      rawOutput += sessionOutput.text;
      promptPending = sessionOutput.promptPending;
    }

    // Game actions (save/load/cheat/newgame). Without this the commands are
    // silent no-ops headlessly; see applyGameAction.
    if (effects.gameAction) {
      rawOutput += this.applyGameAction(effects.gameAction);
    }

    // Email notifications
    if (effects.emailNotifications > 0) {
      rawOutput += `\n\n${colorize(`You have new mail in /var/mail/${this.username}`, ansi.yellow, ansi.bold)}`;
    }

    return {
      output: stripAnsi(rawOutput),
      rawOutput,
      exitCode: result.exitCode ?? 0,
      events: effects.events,
      storyFlagUpdates: effects.storyFlagUpdates,
      newEmails: effects.newDeliveredEmailIds,
      promptPending,
      sshSessionStarted: effects.startSession?.type === "ssh",
      // Reported, not enacted: the transition itself (boot lines, termination
      // cinematic, tab teardown) is React-side. Use :switch to follow it.
      transitionTo: effects.transitionTo as ComputerId | undefined,
      terminationReason: effects.terminationReason,
    };
  }

  /**
   * Mirror of the `effects.gameAction` branch in useTerminal.ts's
   * executeEffects, applied to the runner's own fields instead of the Zustand
   * store. `listSaves`/`listCheckpoints` need nothing here (computeEffects
   * already appended the injected renderers' output) and `shutdown`/`reboot`
   * are React transition cinematics with no headless equivalent.
   *
   * The runner holds exactly one live computer, so a slot save snapshots only
   * the active machine; flags/emails/piper/snowflake round-trip through the
   * real saveManager serializer.
   */
  private applyGameAction(action: GameAction): string {
    if (action.type === "save") {
      const label = formatSlotName(action.slotId as SaveSlotId);
      const ok = saveToSlot(action.slotId as SaveSlotId, createSaveData(this.toSaveableState(), `Save ${action.slotId}`));
      return ok ? colorize(`Game saved to ${label}.`, ansi.cyan) : colorize("Error: failed to save game.", ansi.red);
    }

    if (action.type === "load") {
      const label = formatSlotName(action.slotId as SaveSlotId);
      const data = loadFromSlot(action.slotId as SaveSlotId);
      if (!data || data.version !== SAVE_FORMAT_VERSION) {
        return colorize(`Error: ${label} is empty or corrupted.`, ansi.red);
      }
      this.restoreFrom(restoreGameState(data));
      this.stateReloaded = true;
      return colorize(`Loaded save from ${label}.`, ansi.cyan);
    }

    if (action.type === "loadCheckpoint") {
      const cp = CHECKPOINTS.find((c) => c.id === action.checkpointId);
      if (!cp) return colorize(`Error: unknown checkpoint '${action.checkpointId}'.`, ansi.red);
      this.loadCheckpoint(cp);
      this.stateReloaded = true;
      return colorize(`Loaded checkpoint: ${cp.id}`, ansi.cyan);
    }

    if (action.type === "newGame") {
      // The browser asks y/n then reloads the page; headless has no mid-command
      // input, so the reset is immediate.
      Object.assign(this, new GameRunner("home"));
      this.stateReloaded = true;
      return colorize("New game started.", ansi.cyan);
    }

    return "";
  }

  /** Snapshot the runner as the store shape saveManager serializes. */
  private toSaveableState(): SaveableState {
    const win = makeWindow(this.activeComputer, this.cwd);
    return {
      username: this.username,
      currentChapter: this.currentChapter,
      completedObjectives: this.completedObjectives,
      deliveredEmailIds: this.deliveredEmailIds,
      deliveredPiperIds: this.deliveredPiperIds,
      storyFlags: this.storyFlags,
      hasSeenIntro: true,
      computerState: {
        [this.activeComputer]: {
          fs: this.fs,
          envVars: this.envVars[this.activeComputer] ?? {},
          aliases: this.aliases[this.activeComputer] ?? {},
          mounts: this.mounts[this.activeComputer],
        },
      },
      zshHistory: {},
      windows: [win],
      activeWindowId: win.id,
      tmuxAttachedSession: null,
      tmuxDetachedSessions: [],
      notifiedChipTopicIds: [],
      snowflakeState: this.snowflakeState,
      copyModeHelpHidden: false,
    };
  }

  /**
   * Adopt a restored save snapshot, landing on the saved window's active pane.
   * Per-computer maps are replaced wholesale, matching the browser's
   * `set(restoreGameState(data))`: a machine missing from the save must
   * re-initialise on the next `:switch`, not inherit the pre-load session.
   */
  private restoreFrom(restored: RestoredGameState): void {
    this.username = restored.username;
    this.currentChapter = restored.currentChapter;
    this.completedObjectives = [...restored.completedObjectives];
    this.deliveredEmailIds = [...restored.deliveredEmailIds];
    this.deliveredPiperIds = [...restored.deliveredPiperIds];
    this.storyFlags = { ...restored.storyFlags };
    this.snowflakeState = restored.snowflakeState;
    this.snowflakeContext = createDefaultContext(this.username);
    this.pendingPrompt = null;
    this.resetPerComputerState();

    const win = restored.windows.find((w) => w.id === restored.activeWindowId) ?? restored.windows[0];
    const leaves = allLeaves(win.root);
    const leaf = leaves.find((l) => l.id === win.activePaneId) ?? leaves[0];
    this.activeComputer = leaf.computerId as ComputerId;
    this.cwd = leaf.cwd;

    for (const [id, cs] of Object.entries(restored.computerState)) {
      if (!cs) continue;
      this.envVars[id as ComputerId] = cs.envVars;
      this.aliases[id as ComputerId] = cs.aliases;
      this.mounts[id as ComputerId] = cs.mounts;
    }
    this.fs = restored.computerState[this.activeComputer]!.fs;
  }

  /** Drop every per-computer session map, as a whole-store `set()` would. */
  private resetPerComputerState(): void {
    this.envVars = {};
    this.aliases = {};
    this.mounts = { home: {}, nexacorp: {}, devcontainer: {}, chipinfra: {}, "erik-pc": {} };
    // The store clears its zshHistory mirror on load so each rebuilt FS's
    // seeded .zsh_history stands; this array is the runner's equivalent.
    this.commandHistory = { home: [], nexacorp: [], devcontainer: [], chipinfra: [], "erik-pc": [] };
  }

  /** Mirror of gameStore.loadCheckpointData against the runner's own fields. */
  private loadCheckpoint(cp: Checkpoint): void {
    const sfState = createInitialSnowflakeState({ includeDay2: !!cp.storyFlags.day1_shutdown });
    this.username = PLAYER.username;
    this.storyFlags = { ...cp.storyFlags };
    this.deliveredEmailIds = [...cp.deliveredEmailIds];
    this.deliveredPiperIds = [...cp.deliveredPiperIds];
    this.completedObjectives = [...cp.completedObjectives];
    this.currentChapter = cp.chapter;
    this.snowflakeState = sfState;
    this.snowflakeContext = createDefaultContext(this.username);
    this.pendingPrompt = null;
    this.resetPerComputerState();

    if (!cp.computers.includes(cp.activeComputer)) {
      throw new Error(`Checkpoint "${cp.id}" activeComputer "${cp.activeComputer}" missing from its computers list`);
    }
    for (const computerId of cp.computers) {
      const built = buildFs(this.username, computerId, cp.storyFlags, cp.deliveredEmailIds);
      const fs = computerId === "nexacorp" ? syncToVirtualFS(sfState, built) : built;
      this.envVars[computerId] = { ...initEnvForComputer(computerId, this.username, fs), ...(cp.envVars?.[computerId] ?? {}) };
      this.aliases[computerId] = { ...initAliasesForComputer(computerId, this.username, fs), ...(cp.aliases?.[computerId] ?? {}) };
      // The runner keeps one live FS; the others are rebuilt on :switch.
      if (computerId === cp.activeComputer) this.fs = fs;
    }
    // The store's window opens on `/home/<player>` regardless of the machine's
    // session user, so mirror that rather than the FS's own homeDir.
    this.cwd = `/home/${PLAYER.username}`;
    this.activeComputer = cp.activeComputer;
  }

  /** Handle session start requests — store prompts, surface info for editor/snow-sql/python. */
  private handleSessionStart(session: SessionToStart): { text: string; promptPending: boolean } {
    if (session.type === "prompt") {
      this.pendingPrompt = session.info;
      // Include the prompt text and options in output
      const text = "\n" + session.info.promptText;
      return { text, promptPending: true };
    }

    if (session.type === "editor") {
      const { filePath, content, readOnly, editor } = session.info;
      const preview = content.length > 200 ? content.slice(0, 200) + "..." : content;
      const text = `\n[${editor ?? "nano"} would open: ${filePath}${readOnly ? " (read-only)" : ""}]\nContent preview:\n${preview}\nUse :write ${filePath} <content> or runner.writeFile() to edit.`;
      return { text, promptPending: false };
    }

    if (session.type === "snow-sql") {
      return { text: "\n[Snowflake CLI interactive session — use 'dbt' commands or runner.run('snow sql') for queries]", promptPending: false };
    }

    if (session.type === "pythonRepl") {
      return { text: "\n[Python REPL — use :python <code> or runner.runPython() for headless execution]", promptPending: false };
    }

    return { text: "", promptPending: false };
  }
}

// ── REPL ────────────────────────────────────────────────────────────

async function main() {
  const readline = await import("readline");
  const runner = new GameRunner("home");

  console.log("Termoil - Headless Runner");
  console.log(`Computer: ${runner.activeComputer} | User: ${runner.username}`);
  console.log("Type :help for REPL commands, :quit to exit\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  function getPrompt(): string {
    const displayCwd = runner.cwd.startsWith(runner.fs.homeDir)
      ? "~" + runner.cwd.slice(runner.fs.homeDir.length)
      : runner.cwd;
    const hostname = COMPUTERS[runner.activeComputer].promptHostname;
    return `${runner.username}@${hostname}:${displayCwd}$ `;
  }

  function printOutput(result: CommandOutput) {
    if (result.rawOutput) {
      console.log(result.rawOutput);
    }
    if (result.newEmails.length > 0) {
      console.log(colorize(`\nYou have new mail in /var/mail/${runner.username}`, ansi.yellow, ansi.bold));
    }
    if (result.promptPending && runner.pendingPrompt) {
      console.log("(Use :select N to choose an option)");
    }
    if (result.sshSessionStarted) {
      console.log("\n[SSH session started! Use :switch nexacorp to continue]");
    }
    if (result.terminationReason) {
      const v = result.terminationReason;
      console.log(colorize(
        `\n[corp-sec] ${v.kind}: ${v.path}${v.destPath ? ` -> ${v.destPath}` : ""} (\`${v.command}\`, ${v.descendantCount} path(s))`,
        ansi.red, ansi.bold,
      ));
      console.log(colorize("Connection to nexacorp closed. Session terminated by corporate security.", ansi.red));
      // The browser forcibly routes the player home; staying logged in on the
      // machine that just terminated you is a state the real game can't reach.
      const dest = (result.transitionTo ?? "home") as ComputerId;
      runner.switchComputer(dest);
      console.log(`[transition] routed to ${dest} (${COMPUTERS[dest].promptHostname})`);
    } else if (result.transitionTo && result.transitionTo !== runner.activeComputer) {
      // Ordinary transitions (exit, coder stop) stay opt-in: the boot/teardown
      // cinematic is React-side and playtests drive the move themselves.
      console.log(`[transition] the real game would route to ${result.transitionTo}; use :switch ${result.transitionTo}`);
    }
  }

  /** Run one submitted line. Returns true when the REPL should exit. */
  async function handleLine(trimmed: string): Promise<boolean> {
    if (!trimmed) return false;

    // REPL meta-commands
    if (trimmed === ":quit" || trimmed === ":q") return true;

    if (trimmed === ":help") {
      console.log([
        "REPL commands:",
        "  :status          — game state summary",
        "  :flags           — all story flags",
        "  :emails          — delivered email IDs",
        "  :objectives      — completed objectives",
        `  :switch ID       — switch computer (${Object.keys(COMPUTERS).join(", ")})`,
        "  :select N        — resolve pending prompt (choose option N)",
        "  :write PATH TEXT — write file directly (replaces nano)",
        "  :python CODE     — run Python code",
        "  :quit            — exit",
      ].join("\n"));
      return false;
    }

    if (trimmed === ":status") {
      console.log(runner.status());
      return false;
    }

    if (trimmed === ":flags") {
      const flags = runner.storyFlags;
      const keys = Object.keys(flags);
      if (keys.length === 0) {
        console.log("(no story flags set)");
      } else {
        for (const k of keys) {
          console.log(`  ${k}: ${flags[k]}`);
        }
      }
      return false;
    }

    if (trimmed === ":emails") {
      if (runner.deliveredEmailIds.length === 0) {
        console.log("(no emails delivered yet)");
      } else {
        for (const id of runner.deliveredEmailIds) {
          console.log(`  ${id}`);
        }
      }
      return false;
    }

    if (trimmed === ":objectives") {
      if (runner.completedObjectives.length === 0) {
        console.log("(no objectives completed)");
      } else {
        for (const obj of runner.completedObjectives) {
          console.log(`  ${obj}`);
        }
      }
      return false;
    }

    if (trimmed.startsWith(":switch ")) {
      const target = trimmed.slice(8).trim() as ComputerId;
      // Every computer switchComputer can rebuild an FS for.
      if (!Object.hasOwn(COMPUTERS, target)) {
        console.log(`Usage: :switch ${Object.keys(COMPUTERS).join("|")}`);
      } else {
        runner.switchComputer(target);
        console.log(`Switched to ${target} (${COMPUTERS[target].promptHostname})`);
      }
      return false;
    }

    if (trimmed.startsWith(":select ")) {
      const n = parseInt(trimmed.slice(8).trim(), 10);
      if (isNaN(n)) {
        console.log("Usage: :select N (where N is the option number)");
      } else {
        printOutput(runner.selectOption(n));
      }
      return false;
    }

    if (trimmed.startsWith(":write ")) {
      const rest = trimmed.slice(7).trim();
      const spaceIdx = rest.indexOf(" ");
      if (spaceIdx === -1) {
        console.log("Usage: :write PATH CONTENT");
      } else {
        const path = rest.slice(0, spaceIdx);
        runner.writeFile(path, rest.slice(spaceIdx + 1));
        console.log(`Written to ${path}`);
      }
      return false;
    }

    if (trimmed.startsWith(":python ")) {
      const code = trimmed.slice(8);
      try {
        const out = runner.runPython(code);
        if (out) console.log(out);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Python error: ${msg}`);
      }
      return false;
    }

    // runAsync handles sync commands too (and aliases may expand to async ones)
    printOutput(await runner.runAsync(trimmed));
    return false;
  }

  // Lines are queued and drained one at a time. `rl.question`'s callback only
  // re-arms after the awaited command settles, so piped stdin
  // (`printf 'a\nb\n' | npm run play`) delivered every buffered line to a
  // listener that no longer existed and all but the first vanished.
  const isTty = Boolean(process.stdin.isTTY);
  const queue: string[] = [];
  let draining = false;
  let inputClosed = false;
  let quitting = false;

  function showPrompt() {
    if (isTty) {
      rl.setPrompt(getPrompt());
      rl.prompt();
    }
  }

  /**
   * Stop reading and let Node exit once the event loop empties. Never
   * `process.exit()`: on a pipe, stdout writes are asynchronous and an explicit
   * exit throws away whatever is still buffered (a big `:python` dump was
   * getting cut mid-line).
   */
  function shutdown() {
    rl.close();
    process.stdin.pause();
    process.exitCode = 0;
  }

  async function drain() {
    if (draining) return;
    draining = true;
    while (queue.length > 0 && !quitting) {
      const line = queue.shift()!;
      // Piped stdin isn't echoed by readline; print it so the transcript reads
      // like a session.
      if (!isTty) console.log(getPrompt() + line);
      quitting = await handleLine(line.trim());
    }
    draining = false;
    if (quitting || inputClosed) {
      shutdown();
      return;
    }
    showPrompt();
  }

  rl.on("line", (line: string) => {
    queue.push(line);
    void drain();
  });
  // `drain` sets its flag synchronously, so at close time either it owns the
  // queue (and shuts down when empty) or there is nothing left to run.
  rl.on("close", () => {
    inputClosed = true;
    if (!draining) shutdown();
  });

  showPrompt();
}

// Run REPL if executed directly
const isDirectRun = process.argv[1]?.endsWith("play.ts") || process.argv[1]?.includes("play.ts");
if (isDirectRun) {
  main().catch(console.error);
}
