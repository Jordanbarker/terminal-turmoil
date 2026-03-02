---
name: commands
description: "Command parser, registry, pipeline execution, and how to add new commands. Use this skill whenever adding a new terminal command, modifying the command parser or pipeline, working on applyResult.ts/computeEffects(), or touching files under src/engine/commands/ (except dbt.ts, mail.ts, snowsql.ts which have their own skills)."
---

# Command System

The command system handles parsing terminal input, dispatching to registered command handlers, chaining pipelines, and computing side effects — all as pure functions.

## Architecture

```
src/engine/commands/
├── types.ts               # ParsedCommand, CommandContext, CommandResult, CommandHandler, AsyncCommandHandler
├── registry.ts            # register(), registerAsync(), execute(), executeAsync()
├── parser.ts              # parseInput(), parsePipeline(), splitOnPipe(), tokenize()
├── applyResult.ts         # computeEffects(), AppliedEffects, ApplyContext
├── builtins/
│   ├── index.ts           # Side-effect imports that register all commands
│   ├── cat.ts, ls.ts, cd.ts, grep.ts, find.ts, diff.ts, ...  # Individual commands
│   ├── dbt.ts             # (see dbt skill)
│   ├── mail.ts            # (see email skill)
│   └── snowsql.ts         # (see snowflake skill)
└── helpTexts.ts           # HELP_TEXTS lookup for --help output

src/engine/session/
└── types.ts               # ISession, SessionResult — shared interface for interactive modes

src/hooks/
├── useTerminal.ts         # Pipeline orchestrator: chains commands, handles redirection, applies effects
└── useCommandLine.ts      # Input buffer, history navigation, autosuggestions
```

## Core Types (`commands/types.ts`)

```ts
interface ParsedCommand {
  command: string;
  args: string[];
  flags: Record<string, boolean>;  // -x, --flag
  raw: string;
}

interface CommandContext {
  fs: VirtualFS;
  cwd: string;
  homeDir: string;
  activeComputer: ComputerId;
  stdin?: string;               // Piped input from previous command
  commandHistory?: string[];    // For history command
  snowflakeState?: SnowflakeState;
  snowflakeContext?: SnowflakeContext;
}

interface CommandResult {
  output: string;
  exitCode?: number;
  newCwd?: string;              // cd changes directory
  newFs?: VirtualFS;            // Filesystem mutations
  clearScreen?: boolean;        // clear command
  editorSession?: { ... };      // Enter nano editor
  interactiveSession?: { ... }; // Enter Python REPL
  snowsqlSession?: { ... };     // Enter SnowSQL
  promptSession?: { ... };      // Enter inline prompt
  gameAction?: GameAction;      // save/load/newgame
  triggerEvents?: GameEvent[];  // Events for email/story processing
}

type CommandHandler = (args: string[], flags: Record<string, boolean>, ctx: CommandContext) => CommandResult;
type AsyncCommandHandler = (args: string[], flags: Record<string, boolean>, ctx: CommandContext) => Promise<CommandResult>;
```

## Registry (`registry.ts`)

```ts
register(name: string, handler: CommandHandler, description: string, helpText?: string): void
registerAsync(name: string, handler: AsyncCommandHandler, description: string, helpText?: string): void
execute(commandName: string, args: string[], flags: Record<string, boolean>, ctx: CommandContext): CommandResult
executeAsync(commandName: string, args: string[], flags: Record<string, boolean>, ctx: CommandContext): Promise<CommandResult>
isAsyncCommand(name: string): boolean
getCommandList(): { name: string; description: string }[]
```

Two internal `Map`s: `commands` (sync) and `asyncCommands` (async). Both auto-handle `--help` if helpText was provided.

## Parser (`parser.ts`)

| Function | Purpose |
|----------|---------|
| `parseInput(raw)` | Tokenize respecting quotes, split into command/args/flags |
| `parsePipeline(raw)` | Split on unquoted `\|`, parse each segment |
| `splitOnPipe(input)` | Split on `\|` outside single/double quotes |
| `tokenize(input)` | Split respecting quotes, handle escape sequences |

Flag parsing: `-x` → `{ x: true }`, `-xyz` → `{ x: true, y: true, z: true }`, `--flag` → `{ flag: true }`.

## Pipeline Execution (`useTerminal`)

1. `parsePipeline(raw)` → array of `ParsedCommand`
2. For each command in sequence:
   - Pass previous command's `output` as `stdin` in `CommandContext`
   - Execute via `execute()` or `executeAsync()`
   - Accumulate `newFs` and `newCwd` across pipeline
3. Last command's output checked for `>` / `>>` redirection → write to file
4. Final `CommandResult` passed to `computeEffects()`

## Effect Computation (`applyResult.ts`)

`computeEffects(result: CommandResult, applyCtx: ApplyContext): AppliedEffects`

**Pure function** — computes all side effects without touching terminal or state.

### ApplyContext (input)

```ts
interface ApplyContext {
  parsedCommand: ParsedCommand;
  parsedArgs: string[];
  cwd: string;
  homeDir: string;
  activeComputer: ComputerId;
  username: string;
  deliveredEmailIds: string[];
  storyFlags: StoryFlags;
  fs: VirtualFS;
}
```

### AppliedEffects (output)

```ts
interface AppliedEffects {
  clearScreen: boolean;
  output: string;
  newFs?: VirtualFS;
  newCwd?: string;
  startSession?: SessionToStart;  // "editor" | "snowsql" | "pythonRepl" | "prompt"
  gameAction?: GameAction;
  events: GameEvent[];
  storyFlagUpdates: StoryFlagUpdate[];
  newDeliveredEmailIds: string[];
  emailNotifications: number;
  triggerTransition: boolean;
  suppressPrompt: boolean;
}
```

### What `computeEffects` Does

1. **Builds event list** — always adds `command_executed`; file-read commands (`cat`, `head`, `tail`, `grep`, `diff`, `wc`, `sort`, `uniq`, `file`) auto-add `file_read` events per argument
2. **Processes story flag triggers** — delegates to `checkStoryFlagTriggers()` for home or NexaCorp triggers
3. **Checks email delivery** — calls `checkEmailDeliveries()` for each event
4. **Detects transitions** — recognizes `nexacorp_followup` email read → `triggerTransition: true`
5. **Special NexaCorp logic** — `diff` on `.bak` files sets `discovered_log_tampering`

## Session Interface (`session/types.ts`)

```ts
interface ISession {
  enter(): void | Promise<void>;           // Initialize (show UI, etc.)
  handleInput(data: string): SessionResult | null;  // null = continue session
}

interface SessionResult {
  type: "continue" | "exit";
  newFs?: VirtualFS;
  newState?: SnowflakeState;
  output?: string;
  triggerEvents?: GameEvent[];
}
```

Session types: editor (nano), snowsql (SnowSQL REPL), pythonRepl (Pyodide), prompt (inline choices).

## Adding a New Command

### Step 1: Create the command file

Create `src/engine/commands/builtins/{name}.ts`:

```ts
import { CommandHandler } from "../types";
import { register } from "../registry";
import { HELP_TEXTS } from "../helpTexts";
import { resolvePath } from "../../lib/pathUtils";

const myCommand: CommandHandler = (args, flags, ctx) => {
  // Use ctx.fs, ctx.cwd, ctx.stdin, etc.
  // Return { output, newFs?, newCwd?, exitCode?, ... }
  return { output: "result" };
};

register("mycommand", myCommand, "Short description", HELP_TEXTS.mycommand);
```

### Step 2: Add help text

Add entry to `HELP_TEXTS` in `helpTexts.ts`.

### Step 3: Register

Add `import "./mycommand";` to `builtins/index.ts`.

### Step 4: Add tests

Create `src/engine/commands/__tests__/mycommand.test.ts`.

## Command Patterns

### Simple (read-only)
```ts
const cmd: CommandHandler = (args, _flags, ctx) => {
  const path = resolvePath(args[0], ctx.cwd, ctx.homeDir);
  const result = ctx.fs.readFile(path);
  if (result.error) return { output: `error: ${result.error}` };
  return { output: result.value };
};
```

### Filesystem mutation
```ts
const cmd: CommandHandler = (args, _flags, ctx) => {
  const newFs = ctx.fs.writeFile(path, content);
  if (newFs.error) return { output: `error: ${newFs.error}` };
  return { output: "", newFs: newFs.value };
};
```

### Piped input
```ts
const cmd: CommandHandler = (args, flags, ctx) => {
  const input = ctx.stdin ?? ctx.fs.readFile(resolvePath(args[0], ctx.cwd, ctx.homeDir)).value;
  // Process input...
  return { output: processedResult };
};
```

### Interactive session
```ts
const cmd: CommandHandler = (args, _flags, ctx) => {
  return { output: "", snowsqlSession: { state, context } };
};
```

### Event-triggering
```ts
const cmd: CommandHandler = (args, _flags, ctx) => {
  return {
    output: "done",
    triggerEvents: [{ type: "command_executed", detail: "my_action" }],
  };
};
```

## Design Principles

- **Pure functions**: `(args, flags, ctx) => CommandResult` — no side effects, no store access
- **Immutable FS**: Mutations return new `VirtualFS` instances via `newFs`
- **No engine→state imports**: Engine layer never imports from `state/` (Zustand). Dependencies flow via `CommandContext`
- **stdin for pipes**: Commands check `ctx.stdin` for piped input, falling back to file args
- **Path resolution**: Always use `resolvePath(arg, ctx.cwd, ctx.homeDir)` for absolute paths
- **ANSI colors**: Use `colorize()` and `ansi` constants from `src/lib/ansi.ts`
