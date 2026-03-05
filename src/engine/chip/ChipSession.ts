import { Terminal } from "@xterm/xterm";
import { ISession, SessionResult } from "../session/types";
import { ChipSessionInfo, ChipMenuItem } from "./types";
import { getMenuItems } from "./menuItems";
import {
  renderHeader,
  renderSeparator,
  renderMenu,
  renderFooter,
  renderHintLine,
  renderUserMessage,
  renderChipResponse,
} from "./render";
import { CTRL_C } from "../terminal/keyCodes";
import { GameEvent } from "../mail/delivery";
import { colorize, ansi } from "../../lib/ansi";

export class ChipSession implements ISession {
  private terminal: Terminal;
  private info: ChipSessionInfo;
  private menuItems: ChipMenuItem[];
  private selectedIndex = 0;
  private bypassOn = true;
  private collectedEvents: GameEvent[] = [];
  private escBuffer = "";
  private menuLineCount = 0;
  private currentPrompt = "How can I help you today?";
  private usedItemIds = new Set<string>();
  private expanded = false;
  private onUsedTopicsChange?: (topics: string[]) => void;

  constructor(terminal: Terminal, info: ChipSessionInfo, onUsedTopicsChange?: (topics: string[]) => void) {
    this.terminal = terminal;
    this.info = info;
    this.menuItems = getMenuItems(info.storyFlags);
    this.onUsedTopicsChange = onUsedTopicsChange;

    const saved = info.storyFlags.used_chip_topics;
    if (typeof saved === "string" && saved) {
      saved.split(",").forEach((id) => this.usedItemIds.add(id));
    }
  }

  enter(): void {
    const width = this.getWidth();
    const header = renderHeader(width);
    const separator = renderSeparator(width);
    const menu = this.buildMenuOutput(this.currentPrompt);
    this.terminal.write(`\x1b[?25l\r\n${header}\r\n${separator}\r\n${menu}`);
  }

  private getVisibleItems(): ChipMenuItem[] {
    if (this.expanded || this.usedItemIds.size === 0) {
      return this.menuItems;
    }
    return this.menuItems.filter(
      (item) => !this.usedItemIds.has(item.id)
    );
  }

  handleInput(data: string): SessionResult | null {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);

      // Handle escape sequences for arrow keys
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
          // Up arrow
          if (this.selectedIndex > 0) {
            this.selectedIndex--;
            this.redrawMenu();
          }
          continue;
        }
        if (char === "B") {
          // Down arrow
          if (this.selectedIndex < this.getVisibleItems().length - 1) {
            this.selectedIndex++;
            this.redrawMenu();
          }
          continue;
        }
        continue;
      }
      this.escBuffer = "";

      // Ctrl+C or q — exit
      if (code === CTRL_C || char === "q") {
        const clear = this.buildClearSequence();
        this.terminal.write(clear + colorize("See you later!", ansi.cyan) + "\r\n\x1b[?25h");
        return {
          type: "exit",
          triggerEvents:
            this.collectedEvents.length > 0
              ? this.collectedEvents
              : undefined,
        };
      }

      // a — toggle used items visibility
      if (char === "a") {
        if (this.usedItemIds.size > 0) {
          this.expanded = !this.expanded;
          this.selectedIndex = 0;
          this.redrawMenu();
        }
        continue;
      }

      // Number keys — jump to item
      if (char >= "1" && char <= "9") {
        const idx = parseInt(char, 10) - 1;
        if (idx < this.getVisibleItems().length) {
          this.selectedIndex = idx;
          return this.selectCurrent();
        }
        continue;
      }

      // Enter — select current item
      if (char === "\r" || char === "\n") {
        return this.selectCurrent();
      }

      // b — toggle bypass
      if (char === "b") {
        this.bypassOn = !this.bypassOn;
        this.redrawMenu();
        continue;
      }
    }

    return null;
  }

  private selectCurrent(): SessionResult | null {
    const visibleItems = this.getVisibleItems();
    const item = visibleItems[this.selectedIndex];

    // Exit option
    if (item.id === "exit") {
      return {
        type: "exit",
        triggerEvents:
          this.collectedEvents.length > 0
            ? this.collectedEvents
            : undefined,
      };
    }

    // Mark as used (never mark "exit")
    this.usedItemIds.add(item.id);
    this.onUsedTopicsChange?.([...this.usedItemIds]);

    // Collect trigger events
    if (item.triggerEvents) {
      this.collectedEvents.push(...item.triggerEvents);
    }

    // Refresh menu items (flags may have changed, e.g. git_access appears after clone_repo)
    const usedStr = [...this.usedItemIds].join(",");
    this.info.storyFlags = { ...this.info.storyFlags, used_chip_topics: usedStr };
    this.menuItems = getMenuItems(this.info.storyFlags);

    // Single write: clear menu + exchange + new menu
    const clear = this.buildClearSequence();
    const width = this.getWidth();
    const userMsg = renderUserMessage(item.label);
    const response = renderChipResponse(item.response, width);
    const separator = renderSeparator(width);
    this.selectedIndex = 0;
    this.expanded = false;
    this.currentPrompt = "";
    const menu = this.buildMenuOutput(this.currentPrompt);
    this.terminal.write(`${clear}\r\n${userMsg}\r\n\r\n${response}\r\n\r\n${separator}\r\n${menu}`);
    return null;
  }

  private buildMenuOutput(prompt: string): string {
    const width = this.getWidth();
    const visibleItems = this.getVisibleItems();
    const usedIds = this.expanded ? this.usedItemIds : undefined;
    const menu = renderMenu(visibleItems, this.selectedIndex, prompt, usedIds);
    const footer = renderFooter(width, this.bypassOn);
    const hasHint = this.usedItemIds.size > 0;
    // Count lines to move up from last line to first for redraw:
    // items (n) + hint (0 or 1) + border (1) + bypass status (1)
    const hasPrompt = prompt.length > 0;
    this.menuLineCount = visibleItems.length + (hasPrompt ? 1 : 0) + (hasHint ? 1 : 0) + 2;
    if (hasHint) {
      const hint = renderHintLine(this.usedItemIds.size, this.expanded);
      return `${menu}\r\n${hint}\r\n${footer}`;
    }
    return `${menu}\r\n${footer}`;
  }

  private buildClearSequence(): string {
    if (this.menuLineCount > 0) {
      const up = this.menuLineCount - 1;
      const seq = up > 0 ? `\x1b[${up}A\r\x1b[J` : `\r\x1b[J`;
      this.menuLineCount = 0;
      return seq;
    }
    return "";
  }

  private redrawMenu(): void {
    const clear = this.buildClearSequence();
    const menu = this.buildMenuOutput(this.currentPrompt);
    this.terminal.write(clear + menu);
  }

  private getWidth(): number {
    return Math.min(this.terminal.cols, 40);
  }
}
