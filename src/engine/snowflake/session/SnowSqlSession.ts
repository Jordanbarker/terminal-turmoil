import { Terminal } from "@xterm/xterm";
import { SnowflakeState } from "../state";
import { SessionContext } from "./context";
import { execute } from "../executor/executor";
import { formatResultSet, formatStatusMessage, formatError } from "../formatter/table_formatter";
import { colorize, ansi } from "../../../lib/ansi";
import { isBackspace, isPrintable, CTRL_C, CTRL_D } from "../../terminal/keyCodes";
import { ISession, SessionResult } from "../../session/types";
import { GameEvent } from "../../mail/delivery";

/**
 * Interactive Snowflake CLI SQL REPL session.
 * Runs inline (not alt screen buffer) — accumulates SQL input until `;`,
 * then executes and renders results.
 */
export class SnowSqlSession implements ISession {
  private inputBuffer = "";
  private cursorPos = 0;
  private escBuffer = "";
  private history: string[] = [];
  private historyIndex = -1;
  private savedInput = "";
  private context: SessionContext;
  private state: SnowflakeState;
  private terminal: Terminal;
  private onStateChange: (state: SnowflakeState) => void;
  private onReleaseLock?: () => void;
  private pendingEvents: GameEvent[] = [];
  private queriedCampaign = false;

  constructor(
    terminal: Terminal,
    state: SnowflakeState,
    context: SessionContext,
    onStateChange: (state: SnowflakeState) => void,
    onReleaseLock?: () => void
  ) {
    this.terminal = terminal;
    this.state = state;
    this.context = context;
    this.onStateChange = onStateChange;
    this.onReleaseLock = onReleaseLock;
  }

  canClose(): boolean {
    this.onReleaseLock?.();
    return true;
  }

  enter(): void {
    const lines = [
      "",
      colorize("Snowflake CLI v3.4.0", ansi.cyan + ansi.bold),
      colorize("Type SQL statements (ending with ;) or 'exit' to quit.", ansi.dim),
      "",
    ];
    this.terminal.write(lines.join("\r\n"));
    this.writePrompt();
  }

  handleInput(data: string): SessionResult {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);

      // Escape sequence buffering (arrow keys etc.)
      if (code === 0x1b) {
        this.escBuffer = "\x1b";
        continue;
      }
      if (this.escBuffer === "\x1b" && char === "[") {
        this.escBuffer = "\x1b[";
        continue;
      }
      if (this.escBuffer === "\x1b[") {
        this.escBuffer = "";
        if (char === "A") {
          this.historyUp();
        } else if (char === "B") {
          this.historyDown();
        } else if (char === "C") {
          if (this.cursorPos < this.inputBuffer.length) {
            this.cursorPos++;
            this.terminal.write("\x1b[C");
          }
        } else if (char === "D") {
          if (this.cursorPos > 0) {
            this.cursorPos--;
            this.terminal.write("\x1b[D");
          }
        }
        continue;
      }
      this.escBuffer = "";

      if (code === CTRL_D && this.inputBuffer.length === 0) {
        this.terminal.write("\r\n");
        return { type: "exit", newState: this.state, triggerEvents: this.pendingEvents.length ? this.pendingEvents : undefined };
      }

      if (char === "\r" || char === "\n") {
        this.terminal.write("\r\n");
        const trimmed = this.inputBuffer.trim();

        // Check for commands
        if (trimmed.toLowerCase() === "quit" || trimmed.toLowerCase() === "exit") {
          return { type: "exit", newState: this.state, triggerEvents: this.pendingEvents.length ? this.pendingEvents : undefined };
        }

        if (trimmed.toLowerCase() === "settings") {
          this.showSettings();
          this.resetInput();
          this.writePrompt();
          continue;
        }

        if (trimmed.toLowerCase() === "help") {
          this.showHelp();
          this.resetInput();
          this.writePrompt();
          continue;
        }

        // Check if input ends with semicolon
        if (trimmed.endsWith(";")) {
          const sql = trimmed.slice(0, -1).trim();
          if (sql) {
            this.history.push(this.inputBuffer.trim());
            this.executeSql(sql);
          }
          this.resetInput();
          this.writePrompt();
        } else if (trimmed === "") {
          this.resetInput();
          this.writePrompt();
        } else {
          // Multi-line input — show continuation prompt
          this.inputBuffer += "\n";
          this.cursorPos = this.inputBuffer.length;
          this.writeContinuationPrompt();
        }
      } else if (isBackspace(code)) {
        if (this.cursorPos > 0) {
          const before = this.inputBuffer.slice(0, this.cursorPos - 1);
          const after = this.inputBuffer.slice(this.cursorPos);
          this.inputBuffer = before + after;
          this.cursorPos--;
          // Move back, write remaining chars + space to erase last char, move cursor back
          this.terminal.write("\b" + after + " " + "\x1b[" + (after.length + 1) + "D");
        }
      } else if (code === CTRL_C) {
        this.terminal.write("^C\r\n");
        this.resetInput();
        this.writePrompt();
      } else if (isPrintable(code)) {
        const before = this.inputBuffer.slice(0, this.cursorPos);
        const after = this.inputBuffer.slice(this.cursorPos);
        this.inputBuffer = before + char + after;
        this.cursorPos++;
        this.terminal.write(char + after);
        if (after.length > 0) {
          this.terminal.write("\x1b[" + after.length + "D");
        }
      }
    }

    return { type: "continue" };
  }

  private resetInput(): void {
    this.inputBuffer = "";
    this.cursorPos = 0;
    this.historyIndex = -1;
    this.savedInput = "";
  }

  private replaceInput(newInput: string): void {
    // Move cursor to start of input, clear to end of line, write new input
    if (this.cursorPos > 0) {
      this.terminal.write("\x1b[" + this.cursorPos + "D");
    }
    this.terminal.write("\x1b[K" + newInput);
    this.inputBuffer = newInput;
    this.cursorPos = newInput.length;
  }

  private historyUp(): void {
    if (this.history.length === 0) return;
    if (this.historyIndex === -1) {
      this.savedInput = this.inputBuffer;
      this.historyIndex = this.history.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex--;
    } else {
      return;
    }
    this.replaceInput(this.history[this.historyIndex]);
  }

  private historyDown(): void {
    if (this.historyIndex === -1) return;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.replaceInput(this.history[this.historyIndex]);
    } else {
      this.historyIndex = -1;
      this.replaceInput(this.savedInput);
    }
  }

  private executeSql(sql: string): void {
    const start = performance.now();
    const { results, state, context } = execute(sql, this.state, this.context);
    const elapsed = (performance.now() - start) / 1000;

    this.state = state;
    this.context = context;
    this.onStateChange(state);

    if (!this.queriedCampaign && /campaign_metrics/i.test(sql)) {
      this.queriedCampaign = true;
      this.pendingEvents.push({ type: "command_executed", detail: "queried_campaign_metrics" });
    }

    for (const result of results) {
      let output: string;
      switch (result.type) {
        case "resultset":
          output = formatResultSet(result.data, elapsed);
          break;
        case "status":
          output = formatStatusMessage(result.data, elapsed);
          break;
        case "error":
          output = formatError(result.message);
          break;
      }
      this.terminal.write(output.replace(/\n/g, "\r\n") + "\r\n");
    }
  }

  private showHelp(): void {
    const lines = [
      colorize("Snowflake CLI Help", ansi.bold + ansi.yellow),
      "",
      colorize("Commands:", ansi.bold),
      `  ${colorize("help", ansi.cyan)}        Show this help message`,
      `  ${colorize("settings", ansi.cyan)}    Show current session settings`,
      `  ${colorize("exit", ansi.cyan)}        Exit Snowflake CLI (also: quit, Ctrl+D)`,
      "",
      colorize("SQL Statements:", ansi.bold),
      `  End SQL statements with ${colorize(";", ansi.cyan)} to execute`,
      `  ${colorize("SELECT", ansi.cyan)}     Query data from tables`,
      `  ${colorize("SHOW", ansi.cyan)}       List databases, schemas, or tables`,
      `  ${colorize("DESCRIBE", ansi.cyan)}   Show table structure`,
      `  ${colorize("USE", ansi.cyan)}        Switch database or schema`,
      "",
      colorize("Examples:", ansi.bold),
      `  SHOW DATABASES;`,
      `  USE DATABASE NEXACORP_PROD;`,
      `  SHOW TABLES;`,
      `  SELECT * FROM employees LIMIT 10;`,
    ];
    this.terminal.write(lines.join("\r\n") + "\r\n");
  }

  private showSettings(): void {
    const lines = [
      colorize("Session Settings:", ansi.bold + ansi.yellow),
      `  database    = ${colorize(this.context.currentDatabase, ansi.cyan)}`,
      `  schema      = ${colorize(this.context.currentSchema, ansi.cyan)}`,
      `  warehouse   = ${colorize(this.context.currentWarehouse, ansi.cyan)}`,
      `  role        = ${colorize(this.context.currentRole, ansi.cyan)}`,
      `  user        = ${colorize(this.context.currentUser, ansi.cyan)}`,
    ];
    this.terminal.write(lines.join("\r\n") + "\r\n");
  }

  private writePrompt(): void {
    const prompt = `${colorize(this.context.currentDatabase + "." + this.context.currentSchema, ansi.cyan)}${colorize(">", ansi.bold)} `;
    this.terminal.write(prompt);
  }

  private writeContinuationPrompt(): void {
    const spaces = " ".repeat(this.context.currentDatabase.length + this.context.currentSchema.length + 1);
    this.terminal.write(`${colorize(spaces, ansi.dim)}${colorize(">", ansi.bold)} `);
  }
}
