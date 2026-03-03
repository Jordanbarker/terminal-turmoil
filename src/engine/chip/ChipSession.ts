import { Terminal } from "@xterm/xterm";
import { ISession, SessionResult } from "../session/types";
import { ChipSessionInfo, ChipMenuItem } from "./types";
import { getMenuItems } from "./menuItems";
import {
  renderHeader,
  renderSeparator,
  renderMenu,
  renderFooter,
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

  constructor(terminal: Terminal, info: ChipSessionInfo) {
    this.terminal = terminal;
    this.info = info;
    this.menuItems = getMenuItems(info.storyFlags);
  }

  enter(): void {
    const width = this.getWidth();
    const header = renderHeader(width);
    const separator = renderSeparator(width);
    const menu = this.buildMenuOutput(this.currentPrompt);
    this.terminal.write(`\x1b[?25l\r\n${header}\r\n${separator}\r\n${menu}`);
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
          if (this.selectedIndex < this.menuItems.length - 1) {
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

      // Number keys — jump to item
      if (char >= "1" && char <= "9") {
        const idx = parseInt(char, 10) - 1;
        if (idx < this.menuItems.length) {
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
    const item = this.menuItems[this.selectedIndex];

    // Exit option
    if (item.id === "exit") {
      const clear = this.buildClearSequence();
      this.terminal.write(
        clear + colorize("Goodbye! Remember, I'm always just a command away.", ansi.cyan) + "\r\n\x1b[?25h"
      );
      return {
        type: "exit",
        triggerEvents:
          this.collectedEvents.length > 0
            ? this.collectedEvents
            : undefined,
      };
    }

    // Collect trigger events
    if (item.triggerEvents) {
      this.collectedEvents.push(...item.triggerEvents);
    }

    // Single write: clear menu + exchange + new menu
    const clear = this.buildClearSequence();
    const width = this.getWidth();
    const userMsg = renderUserMessage(item.label);
    const response = renderChipResponse(item.response, width);
    const separator = renderSeparator(width);
    this.selectedIndex = 0;
    this.currentPrompt = "What else can I help with?";
    const menu = this.buildMenuOutput(this.currentPrompt);
    this.terminal.write(`${clear}\r\n${userMsg}\r\n\r\n${response}\r\n\r\n${separator}\r\n${menu}`);
    return null;
  }

  private buildMenuOutput(prompt: string): string {
    const width = this.getWidth();
    const menu = renderMenu(this.menuItems, this.selectedIndex, prompt);
    const footer = renderFooter(width, this.bypassOn);
    // Count lines to move up from last line to first for redraw:
    // items (n) + border (1) + bypass status (1)
    this.menuLineCount = this.menuItems.length + 2;
    return `${menu}\r\n${footer}`;
  }

  private buildClearSequence(): string {
    if (this.menuLineCount > 0) {
      const seq = `\x1b[${this.menuLineCount}A\r\x1b[J`;
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
