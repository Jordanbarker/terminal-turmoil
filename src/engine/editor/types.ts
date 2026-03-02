import { VirtualFS } from "../filesystem/VirtualFS";

export interface CursorPosition {
  row: number;
  col: number;
}

export interface EditorState {
  lines: string[];
  cursor: CursorPosition;
  scrollOffset: number;
  filePath: string;
  fileName: string;
  modified: boolean;
  readOnly: boolean;
  cutBuffer: string | null;
  message: string | null;
  promptState: "none" | "saveExit";
  showHelp: boolean;
}

export interface EditorConfig {
  rows: number;
  cols: number;
}

export type EditorResult =
  | { type: "continue" }
  | { type: "exit"; newFs?: VirtualFS };
