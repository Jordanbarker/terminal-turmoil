import { Terminal } from "@xterm/xterm";
import { SnowflakeState } from "../state";
import { SessionContext } from "./context";
import { execute } from "../executor/executor";
import { formatResultSet, formatStatusMessage, formatError } from "../formatter/table_formatter";
import { colorize, ansi } from "../../../lib/ansi";
import { isBackspace, isPrintable, CTRL_C, CTRL_D } from "../../terminal/keyCodes";
import { ISession, SessionResult } from "../../session/types";

/**
 * Interactive Snowflake CLI SQL REPL session.
 * Runs inline (not alt screen buffer) — accumulates SQL input until `;`,
 * then executes and renders results.
 */
export class SnowSqlSession implements ISession {
  private inputBuffer = "";
  private context: SessionContext;
  private state: SnowflakeState;
  private terminal: Terminal;
  private onStateChange: (state: SnowflakeState) => void;

  constructor(
    terminal: Terminal,
    state: SnowflakeState,
    context: SessionContext,
    onStateChange: (state: SnowflakeState) => void
  ) {
    this.terminal = terminal;
    this.state = state;
    this.context = context;
    this.onStateChange = onStateChange;
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

      if (code === CTRL_D && this.inputBuffer.length === 0) {
        this.terminal.write("\r\n");
        return { type: "exit", newState: this.state };
      }

      if (char === "\r" || char === "\n") {
        this.terminal.write("\r\n");
        const trimmed = this.inputBuffer.trim();

        // Check for commands
        if (trimmed.toLowerCase() === "quit" || trimmed.toLowerCase() === "exit") {
          return { type: "exit", newState: this.state };
        }

        if (trimmed.toLowerCase() === "settings") {
          this.showSettings();
          this.inputBuffer = "";
          this.writePrompt();
          continue;
        }

        if (trimmed.toLowerCase() === "help") {
          this.showHelp();
          this.inputBuffer = "";
          this.writePrompt();
          continue;
        }

        // Check if input ends with semicolon
        if (trimmed.endsWith(";")) {
          const sql = trimmed.slice(0, -1).trim();
          if (sql) {
            this.executeSql(sql);
          }
          this.inputBuffer = "";
          this.writePrompt();
        } else if (trimmed === "") {
          this.inputBuffer = "";
          this.writePrompt();
        } else {
          // Multi-line input — show continuation prompt
          this.inputBuffer += "\n";
          this.writeContinuationPrompt();
        }
      } else if (isBackspace(code)) {
        if (this.inputBuffer.length > 0) {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.terminal.write("\b \b");
        }
      } else if (code === CTRL_C) {
        this.terminal.write("^C\r\n");
        this.inputBuffer = "";
        this.writePrompt();
      } else if (isPrintable(code)) {
        this.inputBuffer += char;
        this.terminal.write(char);
      }
    }

    return { type: "continue" };
  }

  private executeSql(sql: string): void {
    const start = performance.now();
    const { results, state, context } = execute(sql, this.state, this.context);
    const elapsed = (performance.now() - start) / 1000;

    this.state = state;
    this.context = context;
    this.onStateChange(state);

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
