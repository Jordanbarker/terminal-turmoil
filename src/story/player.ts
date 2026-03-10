import { ComputerId } from "../state/types";

export const PLAYER = {
  displayName: "Ren",   // Narrative text, documents, sign-offs
  username: "ren",      // Unix username (paths, prompts, emails)
} as const;

export const COMPUTERS: Record<ComputerId, { hostname: string; promptHostname: string }> = {
  home: { hostname: "maniac-iv", promptHostname: "maniac-iv" },
  nexacorp: { hostname: "nexacorp-ws01", promptHostname: "nexacorp-ws01" },
  devcontainer: { hostname: "coder-ai", promptHostname: "coder-ai" },
};
