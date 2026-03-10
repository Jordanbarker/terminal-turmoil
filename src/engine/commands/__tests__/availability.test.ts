import { describe, it, expect } from "vitest";
import { isCommandAvailable, HOME_COMMANDS } from "../availability";

describe("isCommandAvailable", () => {
  describe("home computer", () => {
    it("allows all home commands from the start", () => {
      for (const cmd of HOME_COMMANDS) {
        if (cmd === "pdftotext" || cmd === "tree") continue;
        expect(isCommandAvailable(cmd, "home")).toBe(true);
        expect(isCommandAvailable(cmd, "home", {})).toBe(true);
      }
    });

    it("blocks ssh without ssh_unlocked flag", () => {
      expect(isCommandAvailable("ssh", "home")).toBe(false);
      expect(isCommandAvailable("ssh", "home", {})).toBe(false);
      expect(isCommandAvailable("ssh", "home", { ssh_unlocked: true })).toBe(true);
    });

    it("blocks sudo and apt without apt_unlocked flag", () => {
      expect(isCommandAvailable("sudo", "home")).toBe(false);
      expect(isCommandAvailable("sudo", "home", {})).toBe(false);
      expect(isCommandAvailable("apt", "home")).toBe(false);
      expect(isCommandAvailable("apt", "home", {})).toBe(false);
      expect(isCommandAvailable("sudo", "home", { apt_unlocked: true })).toBe(true);
      expect(isCommandAvailable("apt", "home", { apt_unlocked: true })).toBe(true);
    });

    it("blocks pdftotext without pdftotext_unlocked flag", () => {
      expect(isCommandAvailable("pdftotext", "home")).toBe(false);
      expect(isCommandAvailable("pdftotext", "home", {})).toBe(false);
      expect(isCommandAvailable("pdftotext", "home", { pdftotext_unlocked: true })).toBe(true);
    });

    it("blocks tree without tree_installed flag", () => {
      expect(isCommandAvailable("tree", "home")).toBe(false);
      expect(isCommandAvailable("tree", "home", {})).toBe(false);
      expect(isCommandAvailable("tree", "home", { tree_installed: true })).toBe(true);
    });

    it("allows python on home computer", () => {
      expect(isCommandAvailable("python", "home")).toBe(true);
    });

    it("blocks commands not in the home set and not unlocked via NexaCorp", () => {
      const blocked = ["grep", "find", "dbt", "snowsql", "diff", "wc", "echo", "chmod", "mkdir", "rm", "mv", "cp", "touch"];
      for (const cmd of blocked) {
        expect(isCommandAvailable(cmd, "home")).toBe(false);
      }
    });

    it("unlocks NexaCorp-gated commands on home when their flag is set", () => {
      expect(isCommandAvailable("grep", "home", { search_tools_unlocked: true })).toBe(true);
      expect(isCommandAvailable("find", "home", { search_tools_unlocked: true })).toBe(true);
      expect(isCommandAvailable("diff", "home", { search_tools_unlocked: true })).toBe(true);
      expect(isCommandAvailable("head", "home", { inspection_tools_unlocked: true })).toBe(true);
      expect(isCommandAvailable("tail", "home", { inspection_tools_unlocked: true })).toBe(true);
      expect(isCommandAvailable("wc", "home", { inspection_tools_unlocked: true })).toBe(true);
      expect(isCommandAvailable("sort", "home", { processing_tools_unlocked: true })).toBe(true);
      expect(isCommandAvailable("uniq", "home", { processing_tools_unlocked: true })).toBe(true);
    });

    it("does not unlock NexaCorp-gated commands on home without their flag", () => {
      expect(isCommandAvailable("grep", "home", {})).toBe(false);
      expect(isCommandAvailable("head", "home", {})).toBe(false);
      expect(isCommandAvailable("sort", "home", {})).toBe(false);
    });
  });

  describe("nexacorp computer", () => {
    it("allows base commands without any flags", () => {
      const baseCmds = ["ls", "cd", "cat", "pwd", "mkdir", "rm", "mv", "cp", "touch", "echo", "chmod", "nano", "mail", "clear", "help", "history", "whoami", "hostname", "uname", "date", "which", "man", "file", "save", "load", "newgame", "sudo", "apt", "ssh"];
      for (const cmd of baseCmds) {
        expect(isCommandAvailable(cmd, "nexacorp")).toBe(true);
      }
    });

    it("blocks gated commands without flags", () => {
      expect(isCommandAvailable("grep", "nexacorp")).toBe(false);
      expect(isCommandAvailable("find", "nexacorp")).toBe(false);
      expect(isCommandAvailable("diff", "nexacorp")).toBe(false);
      expect(isCommandAvailable("head", "nexacorp")).toBe(false);
      expect(isCommandAvailable("tail", "nexacorp")).toBe(false);
      expect(isCommandAvailable("wc", "nexacorp")).toBe(false);
      expect(isCommandAvailable("sort", "nexacorp")).toBe(false);
      expect(isCommandAvailable("uniq", "nexacorp")).toBe(false);
      expect(isCommandAvailable("coder", "nexacorp")).toBe(false);
      expect(isCommandAvailable("chip", "nexacorp")).toBe(false);
      expect(isCommandAvailable("piper", "nexacorp")).toBe(false);
    });

    it("unlocks search tools with search_tools_unlocked flag", () => {
      const flags = { search_tools_unlocked: true };
      expect(isCommandAvailable("grep", "nexacorp", flags)).toBe(true);
      expect(isCommandAvailable("find", "nexacorp", flags)).toBe(true);
      expect(isCommandAvailable("diff", "nexacorp", flags)).toBe(true);
    });

    it("unlocks inspection tools with inspection_tools_unlocked flag", () => {
      const flags = { inspection_tools_unlocked: true };
      expect(isCommandAvailable("head", "nexacorp", flags)).toBe(true);
      expect(isCommandAvailable("tail", "nexacorp", flags)).toBe(true);
      expect(isCommandAvailable("wc", "nexacorp", flags)).toBe(true);
    });

    it("unlocks processing tools with processing_tools_unlocked flag", () => {
      const flags = { processing_tools_unlocked: true };
      expect(isCommandAvailable("sort", "nexacorp", flags)).toBe(true);
      expect(isCommandAvailable("uniq", "nexacorp", flags)).toBe(true);
    });

    it("unlocks coder with coder_unlocked flag", () => {
      expect(isCommandAvailable("coder", "nexacorp", { coder_unlocked: true })).toBe(true);
    });

    it("unlocks chip with chip_unlocked flag", () => {
      expect(isCommandAvailable("chip", "nexacorp", { chip_unlocked: true })).toBe(true);
    });

    it("unlocks piper with piper_unlocked flag", () => {
      expect(isCommandAvailable("piper", "nexacorp", { piper_unlocked: true })).toBe(true);
    });
  });

  describe("devcontainer", () => {
    it("allows dbt, snowsql, python, and chip in devcontainer", () => {
      expect(isCommandAvailable("dbt", "devcontainer")).toBe(true);
      expect(isCommandAvailable("snowsql", "devcontainer")).toBe(true);
      expect(isCommandAvailable("python", "devcontainer")).toBe(true);
      expect(isCommandAvailable("chip", "devcontainer")).toBe(true);
    });

    it("allows standard commands in devcontainer", () => {
      const cmds = ["ls", "cd", "cat", "pwd", "clear", "help", "nano", "grep", "find", "diff", "head", "tail", "wc", "sort", "uniq", "echo", "exit"];
      for (const cmd of cmds) {
        expect(isCommandAvailable(cmd, "devcontainer")).toBe(true);
      }
    });

    it("blocks coder command in devcontainer", () => {
      expect(isCommandAvailable("coder", "devcontainer")).toBe(false);
    });

    it("blocks commands not in devcontainer whitelist", () => {
      expect(isCommandAvailable("ssh", "devcontainer")).toBe(false);
      expect(isCommandAvailable("mail", "devcontainer")).toBe(false);
      expect(isCommandAvailable("sudo", "devcontainer")).toBe(false);
      expect(isCommandAvailable("apt", "devcontainer")).toBe(false);
      expect(isCommandAvailable("pdftotext", "devcontainer")).toBe(false);
    });

    it("does not require story flags in devcontainer", () => {
      expect(isCommandAvailable("dbt", "devcontainer", {})).toBe(true);
      expect(isCommandAvailable("grep", "devcontainer", {})).toBe(true);
    });
  });
});
