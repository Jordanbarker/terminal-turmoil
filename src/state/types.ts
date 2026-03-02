import { VirtualFS } from "../engine/filesystem/VirtualFS";

export type GamePhase = "login" | "booting" | "playing" | "transitioning";

export type ComputerId = "home" | "nexacorp";

export const PLAYER = {
  displayName: "Ren",   // Narrative text, documents, sign-offs
  username: "ren",      // Unix username (paths, prompts, emails)
} as const;

export const COMPUTERS: Record<ComputerId, { hostname: string; promptHostname: string }> = {
  home: { hostname: "maniac-iv", promptHostname: "maniac-iv" },
  nexacorp: { hostname: "nexacorp-ws01", promptHostname: "nexacorp-ws01" },
};

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
