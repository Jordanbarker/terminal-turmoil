import { EditorState, EditorConfig } from "./types";

const ESC = "\x1b[";
const REVERSE = `${ESC}7m`;
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;

const HELP_TEXT = [
  "  nano help — keyboard shortcuts",
  "",
  "  ^X        Exit editor",
  "  ^O / ^S   Save file",
  "  ^K        Cut current line",
  "  ^U        Paste cut line",
  "  ^G        Toggle this help",
  "",
  "  ^A / Home   Move to start of line",
  "  ^E / End    Move to end of line",
  "  ^Y / PgUp   Page up",
  "  ^V / PgDn   Page down",
  "",
  "  Arrow keys to navigate, type to insert text.",
  "  Press any key to close this help.",
];

function shortcutLabel(key: string, label: string, cols: number): string {
  const padded = `${REVERSE}${key}${RESET} ${label}`;
  // Each shortcut gets roughly 1/5 of the width
  const cellWidth = Math.floor(cols / 5);
  // We need to account for ANSI codes in padding calculation
  const visibleLen = key.length + 1 + label.length;
  const padding = Math.max(0, cellWidth - visibleLen);
  return padded + " ".repeat(padding);
}

/**
 * Render the full editor screen as a single ANSI string.
 */
export function renderEditor(state: EditorState, config: EditorConfig): string {
  const { rows, cols } = config;
  const contentRows = rows - 4; // title(1) + status(1) + shortcut rows(2)
  const parts: string[] = [];

  // Hide cursor during redraw
  parts.push(`${ESC}?25l`);
  // Move to top-left
  parts.push(`${ESC}1;1H`);

  // === Row 1: Title bar ===
  const modifiedTag = state.modified ? " [Modified]" : "";
  const titleText = `  GNU nano    ${state.fileName}${modifiedTag}`;
  const titlePadded = titleText.padEnd(cols);
  parts.push(`${REVERSE}${titlePadded}${RESET}`);

  // === Rows 2..N-3: File content ===
  if (state.showHelp) {
    for (let r = 0; r < contentRows; r++) {
      parts.push(`${ESC}${r + 2};1H${ESC}2K`);
      if (r < HELP_TEXT.length) {
        parts.push(`${BOLD}${HELP_TEXT[r].slice(0, cols)}${RESET}`);
      }
    }
  } else {
    for (let r = 0; r < contentRows; r++) {
      const lineIdx = r + state.scrollOffset;
      parts.push(`${ESC}${r + 2};1H${ESC}2K`);
      if (lineIdx < state.lines.length) {
        const line = state.lines[lineIdx];
        parts.push(line.slice(0, cols));
      }
    }
  }

  // === Row N-2: Status/message line ===
  const statusRow = rows - 2;
  parts.push(`${ESC}${statusRow};1H${ESC}2K`);
  if (state.message) {
    parts.push(`${REVERSE}${state.message.slice(0, cols).padEnd(cols)}${RESET}`);
  }

  // === Row N-1: Shortcut hints row 1 ===
  const hintRow1 = rows - 1;
  parts.push(`${ESC}${hintRow1};1H${ESC}2K`);
  parts.push(
    shortcutLabel("^X", "Exit", cols) +
    shortcutLabel("^O", "Save", cols) +
    shortcutLabel("^K", "Cut", cols) +
    shortcutLabel("^U", "Paste", cols) +
    shortcutLabel("^G", "Help", cols)
  );

  // === Row N: Shortcut hints row 2 ===
  const hintRow2 = rows;
  parts.push(`${ESC}${hintRow2};1H${ESC}2K`);
  parts.push(
    shortcutLabel("^A", "Home", cols) +
    shortcutLabel("^E", "End", cols) +
    shortcutLabel("^Y", "PgUp", cols) +
    shortcutLabel("^V", "PgDn", cols)
  );

  // Position cursor and show it
  if (!state.showHelp) {
    const screenRow = state.cursor.row - state.scrollOffset + 2;
    const screenCol = state.cursor.col + 1;
    parts.push(`${ESC}${screenRow};${screenCol}H`);
  }
  parts.push(`${ESC}?25h`);

  return parts.join("");
}
