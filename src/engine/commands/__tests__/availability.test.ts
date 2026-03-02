import { describe, it, expect } from "vitest";
import { isCommandAvailable, HOME_COMMANDS } from "../availability";

describe("isCommandAvailable", () => {
  describe("home computer", () => {
    it("allows home commands", () => {
      for (const cmd of HOME_COMMANDS) {
        expect(isCommandAvailable(cmd, "home")).toBe(true);
      }
    });

    it("blocks commands not in the home set", () => {
      const blocked = ["grep", "find", "dbt", "snowsql", "python", "diff", "wc", "echo", "chmod", "mkdir", "rm", "mv", "cp", "touch"];
      for (const cmd of blocked) {
        expect(isCommandAvailable(cmd, "home")).toBe(false);
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
