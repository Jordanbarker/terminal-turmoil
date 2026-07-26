import { describe, it, expect } from "vitest";
import { analyzeIncompleteInput, parseChainedPipeline, parsePipeline } from "../parser";

describe("analyzeIncompleteInput", () => {
  it("returns null for balanced input", () => {
    expect(analyzeIncompleteInput("ls -la")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(analyzeIncompleteInput("")).toBeNull();
  });

  it("detects an unterminated double quote", () => {
    expect(analyzeIncompleteInput('echo "hello')).toEqual({ kind: "dquote", prompt: "dquote> " });
  });

  it("detects an unterminated single quote", () => {
    expect(analyzeIncompleteInput("echo 'hello")).toEqual({ kind: "quote", prompt: "quote> " });
  });

  it("prioritizes quote continuation over a trailing pipe inside the quote", () => {
    expect(analyzeIncompleteInput('echo "a |')).toEqual({ kind: "dquote", prompt: "dquote> " });
  });

  it("detects a trailing single backslash", () => {
    expect(analyzeIncompleteInput("echo a\\")).toEqual({ kind: "backslash", prompt: "> " });
  });

  it("treats a trailing double backslash as complete", () => {
    expect(analyzeIncompleteInput("echo a\\\\")).toBeNull();
  });

  it("detects a trailing pipe", () => {
    expect(analyzeIncompleteInput("echo hi |")).toEqual({ kind: "pipe", prompt: "pipe> " });
  });

  it("detects a trailing pipe with trailing spaces", () => {
    expect(analyzeIncompleteInput("echo hi |   ")).toEqual({ kind: "pipe", prompt: "pipe> " });
  });

  it("detects a trailing &&", () => {
    expect(analyzeIncompleteInput("echo x &&")).toEqual({ kind: "cmdand", prompt: "cmdand> " });
  });

  it("detects a trailing && with trailing spaces", () => {
    expect(analyzeIncompleteInput("echo x &&   ")).toEqual({ kind: "cmdand", prompt: "cmdand> " });
  });

  it("detects a trailing ||", () => {
    expect(analyzeIncompleteInput("echo x ||")).toEqual({ kind: "cmdor", prompt: "cmdor> " });
  });

  it("detects a trailing || with trailing spaces", () => {
    expect(analyzeIncompleteInput("echo x ||   ")).toEqual({ kind: "cmdor", prompt: "cmdor> " });
  });

  it("does not treat a trailing & as continuation", () => {
    expect(analyzeIncompleteInput("echo x &")).toBeNull();
  });

  it("does not treat a trailing ; as continuation", () => {
    expect(analyzeIncompleteInput("echo x;")).toBeNull();
  });
});

describe("empty pipeline segments are syntax errors", () => {
  it("rejects a leading pipe instead of silently running the right-hand command", () => {
    const chain = parseChainedPipeline("| ls");
    expect(chain[0].pipeline[0].error).toBe("zsh: parse error near `|'");
    expect(chain[0].pipeline[0].command).toBe("");
  });

  it("rejects a trailing pipe", () => {
    const chain = parseChainedPipeline("ls |");
    expect(chain[0].pipeline[0].error).toBe("zsh: parse error near `|'");
  });

  it("rejects an empty inner segment", () => {
    expect(parsePipeline("ls | | wc")[0].error).toBe("zsh: parse error near `|'");
  });

  it("uses bash wording for script lines", () => {
    const chain = parseChainedPipeline("| ls", "bash");
    expect(chain[0].pipeline[0].error).toBe("bash: syntax error near unexpected token `|'");
  });

  it("leaves a quoted pipe alone", () => {
    const parsed = parsePipeline("echo '| ls'");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].error).toBeUndefined();
    expect(parsed[0].args).toEqual(["| ls"]);
  });

  it("still parses a normal pipeline", () => {
    const parsed = parsePipeline("ls | grep a | wc -l");
    expect(parsed.map((p) => p.command)).toEqual(["ls", "grep", "wc"]);
  });
});
