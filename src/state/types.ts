import { VirtualFS } from "../engine/filesystem/VirtualFS";

export type GamePhase = "login" | "booting" | "playing" | "transitioning";

export type ComputerId = "home" | "nexacorp" | "devcontainer";

// Re-export for convenience so existing imports don't break
export { PLAYER, COMPUTERS } from "../story/player";

export type StoryFlags = Record<string, string | boolean>;

export interface GameState {
  fs: VirtualFS;
  cwd: string;
  commandHistory: string[];
  historyIndex: number;
  currentChapter: string;
  completedObjectives: string[];
  gamePhase: GamePhase;
}
