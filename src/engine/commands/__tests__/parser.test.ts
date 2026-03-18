import { describe, it, expect } from "vitest";
import { parseInput } from "../parser";

describe("parseInput", () => {
  it("returns empty command for empty input", () => {
    const result = parseInput("");
    expect(result.command).toBe("");
    expect(result.args).toEqual([]);
    expect(result.flags).toEqual({});
  });

  it("returns empty command for whitespace-only input", () => {
    const result = parseInput("   ");
    expect(result.command).toBe("");
  });

  it("parses a simple command with no args", () => {
    const result = parseInput("ls");
    expect(result.command).toBe("ls");
    expect(result.args).toEqual([]);
    expect(result.flags).toEqual({});
  });

  it("parses command with arguments", () => {
    const result = parseInput("cat file1.txt file2.txt");
    expect(result.command).toBe("cat");
    expect(result.args).toEqual(["file1.txt", "file2.txt"]);
  });

  it("parses long flags (--flag)", () => {
    const result = parseInput("ls --all --long");
    expect(result.flags).toEqual({ all: true, long: true });
    expect(result.args).toEqual([]);
  });

  it("parses short flags (-a)", () => {
    const result = parseInput("ls -a");
    expect(result.flags).toEqual({ a: true });
  });

  it("expands combined short flags (-la → -l -a)", () => {
    const result = parseInput("ls -la");
    expect(result.flags).toEqual({ l: true, a: true });
  });

  it("handles single-quoted strings", () => {
    const result = parseInput("echo 'hello world'");
    expect(result.args).toEqual(["hello world"]);
  });

  it("handles double-quoted strings", () => {
    const result = parseInput('echo "hello world"');
    expect(result.args).toEqual(["hello world"]);
  });

  it("preserves single quotes inside double quotes", () => {
    const result = parseInput(`echo "it's fine"`);
    expect(result.args).toEqual(["it's fine"]);
  });

  it("preserves double quotes inside single quotes", () => {
    const result = parseInput(`echo 'say "hello"'`);
    expect(result.args).toEqual(['say "hello"']);
  });

  it("mixes flags and args", () => {
    const result = parseInput("ls -l /home");
    expect(result.command).toBe("ls");
    expect(result.flags).toEqual({ l: true });
    expect(result.args).toEqual(["/home"]);
  });

  it("preserves raw input (trimmed)", () => {
    const result = parseInput("  ls -la  ");
    expect(result.raw).toBe("ls -la");
  });

  it("returns error for unterminated double quote", () => {
    const result = parseInput('echo "hello');
    expect(result.error).toBe("syntax error: unterminated quote");
    expect(result.command).toBe("");
  });

  it("returns error for unterminated single quote", () => {
    const result = parseInput("echo 'hello");
    expect(result.error).toBe("syntax error: unterminated quote");
    expect(result.command).toBe("");
  });

  it("returns error for trailing unmatched quote", () => {
    const result = parseInput("dbt build'");
    expect(result.error).toBe("syntax error: unterminated quote");
  });

  it("handles multiple spaces between tokens", () => {
    const result = parseInput("ls   -l   /home");
    expect(result.command).toBe("ls");
    expect(result.args).toEqual(["/home"]);
    expect(result.flags).toEqual({ l: true });
  });

  it("does not treat lone - as a flag", () => {
    const result = parseInput("cat -");
    expect(result.flags).toEqual({});
    expect(result.args).toEqual(["-"]);
  });

  it("populates rawArgs with all tokens after command", () => {
    const result = parseInput("find . -name *.txt -type f");
    expect(result.rawArgs).toEqual([".", "-name", "*.txt", "-type", "f"]);
  });

  it("rawArgs preserves -n and its value", () => {
    const result = parseInput("head -n 5 file.txt");
    expect(result.rawArgs).toEqual(["-n", "5", "file.txt"]);
  });

  it("rawArgs is empty for command with no args", () => {
    const result = parseInput("ls");
    expect(result.rawArgs).toEqual([]);
  });

  it("rawArgs is empty for empty input", () => {
    const result = parseInput("");
    expect(result.rawArgs).toEqual([]);
  });

  it("rawArgs preserves quoted strings", () => {
    const result = parseInput('find . -name "*.py"');
    expect(result.rawArgs).toEqual([".", "-name", "*.py"]);
  });
});
