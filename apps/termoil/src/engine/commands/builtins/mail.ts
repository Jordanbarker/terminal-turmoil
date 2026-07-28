import { CommandHandler } from "@tt/core/commands/types";
import { register } from "@tt/core/commands/registry";
import { setKnownFlags } from "@tt/core/commands/flagValidation";
import { colorize, ansi } from "@tt/core/lib/ansi";
import { pad2 } from "@tt/core/lib/format";
import { basename } from "@tt/core/lib/pathUtils";
import { HELP_TEXTS } from "./helpTexts";
import {
  getMailDir,
  getSentDir,
  getMailEntries,
  markAsRead,
  hasReplyToEmail,
  MailEntry,
} from "../../mail/mailUtils";
import { getEmailDefinitions } from "../../mail/emails";
import { ReplyEmail, ReplyOption } from "../../mail/types";
import { PromptOption, PromptSessionInfo } from "../../prompt/types";
import { GameEvent } from "../../mail/delivery";
import { PLAYER, ComputerId } from "../../../state/types";

const RFC_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RFC_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format a game-time Date as RFC 2822 (`Mon, 23 Feb 2026 08:30:00`). */
function formatRfc2822(d: Date): string {
  return `${RFC_DAYS[d.getDay()]}, ${pad2(d.getDate())} ${RFC_MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatInbox(entries: MailEntry[], mailDir: string, headerLabel: string): string {
  const unreadCount = entries.filter((e) => e.dir === "new").length;
  const total = entries.length;

  const lines: string[] = [
    "",
    colorize(headerLabel, ansi.bold) + ` \u2014 ${mailDir}`,
    `${total} message${total !== 1 ? "s" : ""} (${unreadCount} unread)`,
    "",
  ];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const num = i + 1;
    const isUnread = entry.dir === "new";
    const marker = isUnread ? colorize(" N", ansi.brightYellow) : "  ";
    const numStr = colorize(String(num).padStart(2), ansi.cyan);

    // Extract display name from "Name <email>" format
    const fromMatch = entry.parsed.from.match(/^([^<]+)/);
    const fromName = fromMatch ? fromMatch[1].trim() : entry.parsed.from;

    // Extract short date from "Day, DD Mon YYYY HH:MM:SS" format
    const dateMatch = entry.parsed.date.match(/^(\w+, \d+ \w+)/);
    const shortDate = dateMatch ? dateMatch[1] : entry.parsed.date;

    lines.push(
      `${marker}  ${numStr}  ${fromName.padEnd(18)}${shortDate.padEnd(16)}"${entry.parsed.subject}"`
    );
  }

  lines.push("");
  return lines.join("\n");
}

function formatMessage(entry: MailEntry): string {
  const lines = [
    "",
    colorize("From:", ansi.bold) + `    ${entry.parsed.from}`,
    colorize("To:", ansi.bold) + `      ${entry.parsed.to}`,
    colorize("Date:", ansi.bold) + `    ${entry.parsed.date}`,
    colorize("Subject:", ansi.bold) + ` ${entry.parsed.subject}`,
    "",
    entry.parsed.body,
  ];
  return lines.join("\n");
}

/**
 * Which definition this maildir file is. Keyed on the filename slug (the id
 * stamped in at delivery), because subject+from is not an identity: the three
 * termination variants share both, so header matching always resolved to the
 * first one and `mail` emitted `file_read` for an email the player never got.
 * Headers stay as the fallback for a file the player renamed or hand-wrote.
 */
function findEmailDef(entry: MailEntry, username: string, computer: import("../../../state/types").ComputerId) {
  const defs = getEmailDefinitions(username, computer);
  return (
    defs.find((d) => d.email.id === entry.slug) ??
    defs.find((d) => d.email.subject === entry.parsed.subject && d.email.from === entry.parsed.from)
  );
}

function formatReplyOptions(options: ReplyOption[]): string {
  const lines = [
    "",
    colorize("--- Reply Options ---", ansi.dim),
  ];
  for (let i = 0; i < options.length; i++) {
    lines.push(`  ${colorize(String(i + 1), ansi.cyan)}) ${options[i].label}`);
  }
  return "\n" + lines.join("\n");
}

function buildPromptSession(
  options: ReplyOption[],
  entry: MailEntry,
  username: string,
  computer: import("../../../state/types").ComputerId,
  gameNowMs: number,
  inReplyTo: string
): PromptSessionInfo {
  const fromDomain = computer === "home" ? "email.com" : "nexacorp.com";
  const promptOptions: PromptOption[] = options.map((opt, idx) => {
    // Keyed on the parent email id, never the clock: gameNowMs is the
    // interpolated in-game time, which is constant across a whole day segment,
    // so a timestamped filename let the next reply of the session overwrite the
    // previous one and resurrect its prompt. (parent, option) is also exactly
    // the dedup identity, so one reply per email is enforced by the filesystem.
    const replyEmail: ReplyEmail = {
      // Typed as ReplyEmail (not inlined) so `inReplyTo` survives assignment to
      // PromptOption.replyEmail, whose declared type is core's plain Email.
      id: `reply_${inReplyTo}_${idx}`,
      from: `${username}@${fromDomain}`,
      to: entry.parsed.from,
      date: formatRfc2822(new Date(gameNowMs)),
      subject: `Re: ${entry.parsed.subject}`,
      body: opt.replyBody,
      inReplyTo,
    };
    return {
      label: opt.label,
      replyEmail,
      replyFilename: `sent_${inReplyTo}_${idx}`,
      triggerEvents: opt.triggerEvents,
    };
  });

  return {
    promptText: `Select [1-${options.length}]: `,
    options: promptOptions,
  };
}

const mail: CommandHandler = (args, flags, ctx) => {
  // homeDir is always /home/<user>; the fallback only covers a degenerate "/".
  const username = basename(ctx.homeDir) || PLAYER.username;
  const computer = ctx.activeComputer as ComputerId;
  const fromDomain = computer === "home" ? "email.com" : "nexacorp.com";

  // mail -s "subject" recipient — send a message
  if (flags["s"] && args.length >= 2) {
    const subject = args[0];
    const recipient = args[1];
    const now = ctx.clock?.now() ?? new Date();
    const content = [
      `From: ${username}@${fromDomain}`,
      `To: ${recipient}`,
      `Date: ${formatRfc2822(now)}`,
      `Subject: ${subject}`,
      "",
      "(message body)",
    ].join("\n");

    const filename = `sent_${now.getTime()}`;
    const result = ctx.fs.writeFile(`${getSentDir(username)}/${filename}`, content);
    if (result.fs) {
      return {
        output: `Message sent to ${recipient}.`,
        newFs: result.fs,
      };
    }
    return { output: "mail: failed to send message" };
  }

  const entries = getMailEntries(ctx.fs);

  // mail <number> — read a specific message
  if (args.length > 0) {
    const num = parseInt(args[0], 10);
    if (isNaN(num) || num < 1 || num > entries.length) {
      return { output: `mail: invalid message number '${args[0]}'` };
    }

    const entry = entries[num - 1];
    let newFs = ctx.fs;

    // Mark as read if in new/
    if (entry.dir === "new") {
      const result = markAsRead(ctx.fs, entry.filename);
      newFs = result.fs;
    }

    // Look up the email definition for trigger events and reply options
    const emailDef = findEmailDef(entry, username, computer);
    const triggerEvents: GameEvent[] = [];
    if (emailDef) {
      triggerEvents.push({ type: "file_read", detail: emailDef.email.id });
    }

    // Check for reply options on this email (hide if already replied)
    let output = formatMessage(entry);
    let promptSession: PromptSessionInfo | undefined;

    if (emailDef?.replyOptions && !hasReplyToEmail(newFs, username, emailDef.email.id)) {
      output += formatReplyOptions(emailDef.replyOptions);
      const gameNowMs = (ctx.clock?.now() ?? new Date()).getTime();
      promptSession = buildPromptSession(
        emailDef.replyOptions, entry, username, computer, gameNowMs, emailDef.email.id
      );
    }

    return {
      output,
      newFs: newFs !== ctx.fs ? newFs : undefined,
      promptSession,
      triggerEvents: triggerEvents.length > 0 ? triggerEvents : undefined,
    };
  }

  // mail (no args) — show inbox
  if (entries.length === 0) {
    return { output: "No mail." };
  }

  const headerLabel = computer === "home" ? "Mail" : "NexaCorp Mail";
  return { output: formatInbox(entries, getMailDir(username), headerLabel) };
};

register("mail", mail, "Read and send email", HELP_TEXTS.mail);
setKnownFlags("mail", { short: ["s"] });
