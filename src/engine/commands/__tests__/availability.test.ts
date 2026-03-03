import { describe, it, expect } from "vitest";
import { isCommandAvailable, HOME_COMMANDS, INITIAL_HOME_COMMANDS } from "../availability";

describe("isCommandAvailable", () => {
  describe("home computer — before unlock", () => {
    it("allows initial commands when commands_unlocked is not set", () => {
      for (const cmd of INITIAL_HOME_COMMANDS) {
        expect(isCommandAvailable(cmd, "home")).toBe(true);
        expect(isCommandAvailable(cmd, "home", {})).toBe(true);
      }
    });

    it("blocks post-unlock commands when commands_unlocked is not set", () => {
      const unlockOnly = ["ls", "cd", "cat", "pwd", "mail", "history", "ssh"];
      for (const cmd of unlockOnly) {
        expect(isCommandAvailable(cmd, "home")).toBe(false);
        expect(isCommandAvailable(cmd, "home", {})).toBe(false);
      }
    });
  });

  describe("home computer — after unlock", () => {
    const flags = { commands_unlocked: true, pdftotext_unlocked: true };

    it("allows all home commands after unlock", () => {
      for (const cmd of HOME_COMMANDS) {
        expect(isCommandAvailable(cmd, "home", flags)).toBe(true);
      }
    });

    it("blocks pdftotext without pdftotext_unlocked flag", () => {
      expect(isCommandAvailable("pdftotext", "home", { commands_unlocked: true })).toBe(false);
    });

    it("blocks commands not in the home set", () => {
      const blocked = ["grep", "find", "dbt", "snowsql", "python", "diff", "wc", "echo", "chmod", "mkdir", "rm", "mv", "cp", "touch"];
      for (const cmd of blocked) {
        expect(isCommandAvailable(cmd, "home", flags)).toBe(false);
      }
    });
  });

  describe("nexacorp computer", () => {
    it("allows all commands", () => {
      const allCmds = ["ls", "cd", "cat", "grep", "find", "dbt", "snowsql", "python", "nano", "mail", "help"];
      for (const cmd of allCmds) {
        expect(isCommandAvailable(cmd, "nexacorp")).toBe(true);
      }
    });
  });
});
