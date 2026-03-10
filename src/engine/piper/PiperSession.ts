import { Terminal } from "@xterm/xterm";
import { ISession, SessionResult } from "../session/types";
import { PiperSessionInfo, PiperReplyOption } from "./types";
import {
  getConversationHistory,
  getVisibleChannels,
  getPendingReply,
} from "./delivery";
import {
  renderPiperHeader,
  renderChannelList,
  renderConversation,
  renderReplyMenu,
  renderTypingIndicator,
  renderSeparator,
  renderChannelListFooter,
  renderConversationFooter,
} from "./render";
import { CTRL_C } from "../terminal/keyCodes";
import { GameEvent } from "../mail/delivery";
import { colorize, ansi } from "../../lib/ansi";
import { CHIP_THINKING_DELAY_MS, CHIP_CHAT_LINE_INTERVAL_MS } from "../../lib/timing";

type View = "channels" | "conversation";

export class PiperSession implements ISession {
  private terminal: Terminal;
  private info: PiperSessionInfo;
  private username: string;

  private view: View = "channels";
  private selectedIndex = 0;
  private collectedEvents: GameEvent[] = [];
  private escBuffer = "";

  // Channel list state
  private channelItems: ReturnType<typeof getVisibleChannels> = [];

  // Conversation state
  private activeChannelId = "";
  private activeChannelName = "";
  private activeChannelDesc?: string;
  private replyOptions: PiperReplyOption[] = [];
  private replyDeliveryId = "";

  // Animation state
  private isAnimating = false;
  private animationTimer: ReturnType<typeof setTimeout> | null = null;
  private animationLinesWritten = 0;

  constructor(terminal: Terminal, info: PiperSessionInfo, username: string) {
    this.terminal = terminal;
    this.info = info;
    this.username = username;
  }

  enter(): void {
    this.channelItems = getVisibleChannels(this.info.deliveredPiperIds, this.username);
    this.terminal.write(`\x1b[?1049h\x1b[?25l`);
    this.renderChannelListView();
  }

  handleInput(data: string): SessionResult | null {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      const code = char.charCodeAt(0);

      // During animation, only Ctrl+C skips
      if (this.isAnimating) {
        if (code === CTRL_C) this.skipAnimation();
        continue;
      }

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
          this.moveSelection(-1);
          continue;
        }
        if (char === "B") {
          this.moveSelection(1);
          continue;
        }
        continue;
      }
      this.escBuffer = "";

      // Ctrl+C — exit entirely
      if (code === CTRL_C) {
        return this.exitSession();
      }

      if (this.view === "channels") {
        const result = this.handleChannelListInput(char);
        if (result) return result;
      } else {
        const result = this.handleConversationInput(char);
        if (result) return result;
      }
    }

    return null;
  }

  private handleChannelListInput(char: string): SessionResult | null {
    if (char === "q") {
      return this.exitSession();
    }

    // Number keys — jump to channel
    if (char >= "1" && char <= "9") {
      const idx = parseInt(char, 10) - 1;
      if (idx < this.channelItems.length) {
        this.selectedIndex = idx;
        this.openChannel(idx);
      }
      return null;
    }

    // Enter — open selected channel
    if (char === "\r" || char === "\n") {
      this.openChannel(this.selectedIndex);
      return null;
    }

    return null;
  }

  private handleConversationInput(char: string): SessionResult | null {
    if (char === "q") {
      // Go back to channel list
      this.view = "channels";
      this.selectedIndex = 0;
      this.channelItems = getVisibleChannels(this.info.deliveredPiperIds, this.username);
      const clear = this.buildClearSequence();
      this.terminal.write(clear);
      this.renderChannelListView();
      return null;
    }

    // Number keys — select reply
    if (char >= "1" && char <= "9" && this.replyOptions.length > 0) {
      const idx = parseInt(char, 10) - 1;
      if (idx < this.replyOptions.length) {
        this.selectedIndex = idx;
        this.selectReply(idx);
      }
      return null;
    }

    // Enter — select reply
    if ((char === "\r" || char === "\n") && this.replyOptions.length > 0) {
      this.selectReply(this.selectedIndex);
      return null;
    }

    return null;
  }

  private moveSelection(delta: number): void {
    const maxIdx = this.view === "channels"
      ? this.channelItems.length - 1
      : this.replyOptions.length - 1;

    if (maxIdx < 0) return;

    const newIdx = this.selectedIndex + delta;
    if (newIdx >= 0 && newIdx <= maxIdx) {
      this.selectedIndex = newIdx;
      this.redraw();
    }
  }

  private openChannel(idx: number): void {
    if (idx >= this.channelItems.length) return;
    const item = this.channelItems[idx];

    this.activeChannelId = item.channel.id;
    this.activeChannelName = item.channel.name;
    this.activeChannelDesc = item.channel.description;
    this.view = "conversation";
    this.selectedIndex = 0;

    // Mark as seen
    this.markChannelSeen();

    // Check for pending replies
    const pending = getPendingReply(this.activeChannelId, this.info.deliveredPiperIds, this.username);
    this.replyOptions = pending?.options ?? [];
    this.replyDeliveryId = pending?.deliveryId ?? "";

    const clear = this.buildClearSequence();
    this.terminal.write(clear);
    this.renderConversationView();
  }

  private selectReply(idx: number): void {
    if (idx >= this.replyOptions.length) return;
    const option = this.replyOptions[idx];

    // Track the reply
    const replyId = `reply:${this.replyDeliveryId}:${idx}`;
    this.info.deliveredPiperIds = [...this.info.deliveredPiperIds, replyId];

    // Collect trigger events
    if (option.triggerEvents) {
      this.collectedEvents.push(...option.triggerEvents);
    }

    // Clear reply options — already replied
    this.replyOptions = [];

    // Re-render with the reply shown
    const clear = this.buildClearSequence();
    this.terminal.write(clear);
    this.renderConversationView();
  }

  private markChannelSeen(): void {
    const messages = getConversationHistory(this.activeChannelId, this.info.deliveredPiperIds, this.username);
    const npcMessages = messages.filter((m) => !m.isPlayer);
    const seenPrefix = `seen:${this.activeChannelId}:`;

    // Remove old seen marker
    this.info.deliveredPiperIds = this.info.deliveredPiperIds.filter(
      (id) => !id.startsWith(`seen:${this.activeChannelId}:`)
    );

    // Add new seen marker
    this.info.deliveredPiperIds.push(`${seenPrefix}${npcMessages.length}`);
  }

  private renderChannelListView(): void {
    const width = this.getWidth();
    const header = renderPiperHeader("Piper", width, "NexaCorp Messaging");
    const list = renderChannelList(
      this.channelItems.map((item) => ({
        name: item.channel.name,
        type: item.channel.type,
        unread: item.unread,
      })),
      this.selectedIndex,
      width
    );
    const footer = renderChannelListFooter(width);

    const output = `${header}\r\n\r\n${list}\r\n\r\n${footer}`;
    this.terminal.write(output);
  }

  private renderConversationView(): void {
    const width = this.getWidth();
    const header = renderPiperHeader(this.activeChannelName, width, this.activeChannelDesc);
    const messages = getConversationHistory(this.activeChannelId, this.info.deliveredPiperIds, this.username);
    const conversation = renderConversation(messages, width);
    const hasReply = this.replyOptions.length > 0;
    const sep = renderSeparator(width);
    const footer = renderConversationFooter(width, hasReply);

    let output: string;
    if (hasReply) {
      const replyMenu = renderReplyMenu(this.replyOptions, this.selectedIndex);
      output = `${header}${conversation}\r\n\r\n${sep}\r\n${replyMenu}\r\n${footer}`;
    } else {
      output = `${header}${conversation}\r\n\r\n${footer}`;
    }

    this.terminal.write(output);
  }

  private redraw(): void {
    const clear = this.buildClearSequence();
    this.terminal.write(clear);
    if (this.view === "channels") {
      this.renderChannelListView();
    } else {
      this.renderConversationView();
    }
  }

  private exitSession(): SessionResult {
    const clear = this.buildClearSequence();
    this.terminal.write(clear + "\x1b[?25h\x1b[?1049l");
    return {
      type: "exit",
      triggerEvents: this.collectedEvents.length > 0 ? this.collectedEvents : undefined,
    };
  }

  private buildClearSequence(): string {
    return "\x1b[H\x1b[J";
  }

  private skipAnimation(): void {
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    this.isAnimating = false;
    this.animationLinesWritten = 0;

    // Full redraw
    this.redraw();
  }

  private getWidth(): number {
    return Math.min(this.terminal.cols, 44);
  }
}
