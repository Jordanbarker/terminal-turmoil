import { Terminal } from "@xterm/xterm";
import { VirtualFS } from "../filesystem/VirtualFS";
import { EditorState, EditorConfig } from "./types";
import { parseEditorInput, EditorAction } from "./keymap";
import { renderEditor } from "./render";
import { ISession, SessionResult } from "../session/types";

export class EditorSession implements ISession {
  private state: EditorState;
  private config: EditorConfig;
  private fs: VirtualFS;
  private terminal: Terminal;
  private onSave: (newFs: VirtualFS) => void;

  constructor(
    terminal: Terminal,
    fs: VirtualFS,
    filePath: string,
    content: string,
    readOnly: boolean,
    onSave: (newFs: VirtualFS) => void
  ) {
    this.terminal = terminal;
    this.fs = fs;
    this.onSave = onSave;

    const fileName = filePath.split("/").pop() || filePath;
    const lines = content.split("\n");
    // Ensure at least one line
    if (lines.length === 0) lines.push("");

    this.config = {
      rows: terminal.rows,
      cols: terminal.cols,
    };

    this.state = {
      lines,
      cursor: { row: 0, col: 0 },
      scrollOffset: 0,
      filePath,
      fileName,
      modified: false,
      readOnly,
      cutBuffer: null,
      message: readOnly ? "[ File is read-only ]" : null,
      promptState: "none",
      showHelp: false,
    };
  }

  /** Enter the alternate screen buffer and render initial state. */
  enter(): void {
    this.terminal.write("\x1b[?1049h"); // Enter alt buffer
    this.render();
  }

  /** Process raw xterm input. Returns SessionResult. */
  handleInput(data: string): SessionResult {
    const actions = parseEditorInput(data);

    for (const action of actions) {
      // Help overlay: any key dismisses it
      if (this.state.showHelp && action.type !== "help") {
        this.state.showHelp = false;
        this.render();
        return { type: "continue" };
      }

      // Save-exit prompt: only Y, N, Enter matter
      if (this.state.promptState === "saveExit") {
        return this.handleSaveExitPrompt(action);
      }

      const result = this.processAction(action);
      if (result.type === "exit") return result;
    }

    this.render();
    return { type: "continue" };
  }

  private handleSaveExitPrompt(action: EditorAction): SessionResult {
    if (action.type === "promptYes" || action.type === "insert") {
      const ch = action.type === "insert" ? action.char : "";
      if (ch === "y" || ch === "Y" || action.type === "promptYes") {
        this.save();
        return this.exitEditor();
      }
      if (ch === "n" || ch === "N") {
        return this.exitEditor();
      }
    }
    if (action.type === "exit") {
      // Cancel prompt
      this.state.promptState = "none";
      this.state.message = null;
      this.render();
    }
    return { type: "continue" };
  }

  private processAction(action: EditorAction): SessionResult {
    switch (action.type) {
      case "insert":
        this.insertChar(action.char);
        break;
      case "enter":
        this.insertNewline();
        break;
      case "backspace":
        this.handleBackspace();
        break;
      case "delete":
        this.handleDelete();
        break;
      case "arrowUp":
        this.moveCursor(0, -1);
        break;
      case "arrowDown":
        this.moveCursor(0, 1);
        break;
      case "arrowLeft":
        this.moveCursor(-1, 0);
        break;
      case "arrowRight":
        this.moveCursor(1, 0);
        break;
      case "home":
        this.state.cursor.col = 0;
        break;
      case "end":
        this.state.cursor.col = this.currentLine().length;
        break;
      case "pageUp":
        this.pageMove(-1);
        break;
      case "pageDown":
        this.pageMove(1);
        break;
      case "save":
        if (this.state.readOnly) {
          this.state.message = "[ File is read-only ]";
        } else {
          this.save();
        }
        break;
      case "exit":
        return this.handleExit();
      case "cutLine":
        this.cutLine();
        break;
      case "pasteLine":
        this.pasteLine();
        break;
      case "help":
        this.state.showHelp = !this.state.showHelp;
        break;
      default:
        break;
    }
    return { type: "continue" };
  }

  // === Editing operations ===

  private insertChar(char: string): void {
    if (this.state.readOnly) {
      this.state.message = "[ File is read-only ]";
      return;
    }
    const { row, col } = this.state.cursor;
    const line = this.state.lines[row];
    this.state.lines[row] = line.slice(0, col) + char + line.slice(col);
    this.state.cursor.col++;
    this.state.modified = true;
    this.state.message = null;
  }

  private insertNewline(): void {
    if (this.state.readOnly) {
      this.state.message = "[ File is read-only ]";
      return;
    }
    const { row, col } = this.state.cursor;
    const line = this.state.lines[row];
    const before = line.slice(0, col);
    const after = line.slice(col);
    this.state.lines[row] = before;
    this.state.lines.splice(row + 1, 0, after);
    this.state.cursor.row++;
    this.state.cursor.col = 0;
    this.state.modified = true;
    this.state.message = null;
    this.ensureCursorVisible();
  }

  private handleBackspace(): void {
    if (this.state.readOnly) {
      this.state.message = "[ File is read-only ]";
      return;
    }
    const { row, col } = this.state.cursor;
    if (col > 0) {
      const line = this.state.lines[row];
      this.state.lines[row] = line.slice(0, col - 1) + line.slice(col);
      this.state.cursor.col--;
    } else if (row > 0) {
      // Merge with previous line
      const prevLen = this.state.lines[row - 1].length;
      this.state.lines[row - 1] += this.state.lines[row];
      this.state.lines.splice(row, 1);
      this.state.cursor.row--;
      this.state.cursor.col = prevLen;
    }
    this.state.modified = true;
    this.state.message = null;
    this.ensureCursorVisible();
  }

  private handleDelete(): void {
    if (this.state.readOnly) {
      this.state.message = "[ File is read-only ]";
      return;
    }
    const { row, col } = this.state.cursor;
    const line = this.state.lines[row];
    if (col < line.length) {
      this.state.lines[row] = line.slice(0, col) + line.slice(col + 1);
    } else if (row < this.state.lines.length - 1) {
      // Merge with next line
      this.state.lines[row] += this.state.lines[row + 1];
      this.state.lines.splice(row + 1, 1);
    }
    this.state.modified = true;
    this.state.message = null;
  }

  private cutLine(): void {
    if (this.state.readOnly) {
      this.state.message = "[ File is read-only ]";
      return;
    }
    const { row } = this.state.cursor;
    this.state.cutBuffer = this.state.lines[row];
    if (this.state.lines.length > 1) {
      this.state.lines.splice(row, 1);
      if (this.state.cursor.row >= this.state.lines.length) {
        this.state.cursor.row = this.state.lines.length - 1;
      }
    } else {
      this.state.lines[0] = "";
    }
    this.clampCol();
    this.state.modified = true;
    this.state.message = null;
    this.ensureCursorVisible();
  }

  private pasteLine(): void {
    if (this.state.readOnly) {
      this.state.message = "[ File is read-only ]";
      return;
    }
    if (this.state.cutBuffer === null) return;
    this.state.lines.splice(this.state.cursor.row + 1, 0, this.state.cutBuffer);
    this.state.cursor.row++;
    this.state.cursor.col = 0;
    this.state.modified = true;
    this.state.message = null;
    this.ensureCursorVisible();
  }

  // === Cursor movement ===

  private moveCursor(dx: number, dy: number): void {
    if (dy !== 0) {
      const newRow = this.state.cursor.row + dy;
      if (newRow >= 0 && newRow < this.state.lines.length) {
        this.state.cursor.row = newRow;
        this.clampCol();
      }
    }
    if (dx !== 0) {
      const newCol = this.state.cursor.col + dx;
      if (newCol >= 0 && newCol <= this.currentLine().length) {
        this.state.cursor.col = newCol;
      }
    }
    this.ensureCursorVisible();
  }

  private pageMove(direction: number): void {
    const contentRows = this.config.rows - 4;
    const delta = direction * contentRows;
    const newRow = Math.max(0, Math.min(this.state.lines.length - 1, this.state.cursor.row + delta));
    this.state.cursor.row = newRow;
    this.clampCol();
    this.ensureCursorVisible();
  }

  private clampCol(): void {
    const maxCol = this.currentLine().length;
    if (this.state.cursor.col > maxCol) {
      this.state.cursor.col = maxCol;
    }
  }

  private currentLine(): string {
    return this.state.lines[this.state.cursor.row] || "";
  }

  private ensureCursorVisible(): void {
    const contentRows = this.config.rows - 4;
    if (this.state.cursor.row < this.state.scrollOffset) {
      this.state.scrollOffset = this.state.cursor.row;
    } else if (this.state.cursor.row >= this.state.scrollOffset + contentRows) {
      this.state.scrollOffset = this.state.cursor.row - contentRows + 1;
    }
  }

  // === Save / Exit ===

  private save(): void {
    const content = this.state.lines.join("\n");
    const result = this.fs.writeFile(this.state.filePath, content);
    if (result.fs) {
      this.fs = result.fs;
      this.onSave(result.fs);
      this.state.modified = false;
      this.state.message = `[ Wrote ${this.state.lines.length} lines ]`;
    } else if (result.error) {
      this.state.message = `[ Error: ${result.error} ]`;
    }
  }

  private handleExit(): SessionResult {
    if (this.state.modified) {
      this.state.promptState = "saveExit";
      this.state.message = "Save modified buffer? (Y/N)";
      this.render();
      return { type: "continue" };
    }
    return this.exitEditor();
  }

  private exitEditor(): SessionResult {
    this.terminal.write("\x1b[?1049l"); // Exit alt buffer
    return { type: "exit", newFs: this.fs };
  }

  // === Rendering ===

  private render(): void {
    const output = renderEditor(this.state, this.config);
    this.terminal.write(output);
  }
}
