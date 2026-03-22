import { VirtualFS } from "../filesystem/VirtualFS";
import { PromptSessionInfo } from "../prompt/types";
import { ChipSessionInfo } from "../chip/types";
import { PiperSessionInfo } from "../piper/types";
import type { ComputerId, StoryFlags } from "../../state/types";
import { GameEvent } from "../mail/delivery";
import { SnowflakeState } from "../snowflake/state";
import { SessionContext } from "../snowflake/session/context";

export interface ParsedCommand {
  command: string;
  args: string[];
  flags: Record<string, boolean>;
  raw: string;
  rawArgs: string[];
  error?: string;
}

export interface CommandContext {
  fs: VirtualFS;
  cwd: string;
  homeDir: string;
  activeComputer: ComputerId;
  storyFlags?: StoryFlags;
  stdin?: string;
  rawArgs?: string[];
  isPiped?: boolean;
  commandHistory?: string[];
  snowflakeState?: SnowflakeState;
  snowflakeContext?: SessionContext;
  setSnowflakeState?: (state: SnowflakeState) => void;
  elevated?: boolean;
}

export interface EditorSessionInfo {
  filePath: string;
  content: string;
  readOnly: boolean;
  isNewFile: boolean;
  triggerRow?: number;
  triggerEvents?: GameEvent[];
  requireSave?: boolean;
}

export type GameAction =
  | { type: "save"; slotId: string }
  | { type: "load"; slotId: string }
  | { type: "listSaves" }
  | { type: "newGame" }
  | { type: "shutdown" };

export interface InteractiveSessionInfo {
  type: "pythonRepl";
}

export interface SnowSqlSessionInfo {
  startInteractive: boolean;
}

export interface SshSessionInfo {
  host: string;
  username: string;
}

export interface CommandResult {
  output: string;
  exitCode?: number;
  newCwd?: string;
  newFs?: VirtualFS;
  clearScreen?: boolean;
  editorSession?: EditorSessionInfo;
  gameAction?: GameAction;
  interactiveSession?: InteractiveSessionInfo;
  snowSqlSession?: SnowSqlSessionInfo;
  promptSession?: PromptSessionInfo;
  sshSession?: SshSessionInfo;
  chipSession?: ChipSessionInfo;
  piperSession?: PiperSessionInfo;
  triggerEvents?: GameEvent[];
  transitionTo?: ComputerId;
  incrementalLines?: IncrementalLine[];
}

export interface IncrementalLine {
  text: string;
  delayMs: number;
}

export type CommandHandler = (
  args: string[],
  flags: Record<string, boolean>,
  ctx: CommandContext
) => CommandResult;

export type AsyncCommandHandler = (
  args: string[],
  flags: Record<string, boolean>,
  ctx: CommandContext
) => Promise<CommandResult>;
