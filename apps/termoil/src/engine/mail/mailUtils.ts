import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isDirectory, isFile } from "@tt/core/filesystem/types";
import { Email, ReplyEmail } from "./types";
import { PLAYER } from "../../state/types";

/** Threading header written into `sent/` replies; see `ReplyEmail`. */
export const IN_REPLY_TO_HEADER = "X-In-Reply-To";

export function getMailDir(username: string) {
  return `/var/mail/${username}`;
}
export function getNewDir(username: string) {
  return `${getMailDir(username)}/new`;
}
export function getCurDir(username: string) {
  return `${getMailDir(username)}/cur`;
}
export function getSentDir(username: string) {
  return `${getMailDir(username)}/sent`;
}

export function usernameFromHomeDir(homeDir: string): string {
  const parts = homeDir.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? PLAYER.username;
}

export function slugify(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function formatEmailContent(email: ReplyEmail, read: boolean): string {
  const lines = [
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Date: ${email.date}`,
    `Subject: ${email.subject}`,
  ];
  if (email.inReplyTo) {
    lines.push(`${IN_REPLY_TO_HEADER}: ${email.inReplyTo}`);
  }
  if (read) {
    lines.push("Status: R");
  }
  lines.push("", email.body);
  return lines.join("\n");
}

export interface ParsedEmail {
  from: string;
  to: string;
  date: string;
  subject: string;
  status: string;
  /** Parent email id from `X-In-Reply-To:`; "" for anything the player composed. */
  inReplyTo: string;
  body: string;
}

export function parseEmailContent(content: string): ParsedEmail {
  const lines = content.split("\n");
  const headers: Record<string, string> = {};
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === "") {
      bodyStart = i + 1;
      break;
    }
    const match = line.match(/^(From|To|Date|Subject|Status|X-In-Reply-To):\s*(.*)$/);
    if (match) {
      headers[match[1]] = match[2];
    }
  }

  return {
    from: headers["From"] ?? "",
    to: headers["To"] ?? "",
    date: headers["Date"] ?? "",
    subject: headers["Subject"] ?? "",
    status: headers["Status"] ?? "",
    inReplyTo: headers[IN_REPLY_TO_HEADER] ?? "",
    body: lines.slice(bodyStart).join("\n"),
  };
}

export interface MailEntry {
  filename: string;
  dir: "new" | "cur";
  seq: number;
  /** Filename with the `NNN_` sequence prefix stripped: `slugify(subject)` at delivery time. */
  slug: string;
  parsed: ParsedEmail;
}

export function getMailEntries(fs: VirtualFS): MailEntry[] {
  const entries: MailEntry[] = [];
  const user = usernameFromHomeDir(fs.homeDir);

  for (const dirName of ["new", "cur"] as const) {
    const dirPath = `${getMailDir(user)}/${dirName}`;
    const node = fs.getNode(dirPath);
    if (!node || !isDirectory(node)) continue;

    for (const child of Object.values(node.children)) {
      if (!isFile(child)) continue;
      const seqMatch = child.name.match(/^(\d+)_/);
      if (!seqMatch) continue;
      const parsed = parseEmailContent(child.content);
      // A file in the maildir is only a message if it looks like one. Truncating
      // one (`> 001_welcome_aboard`) or dropping a scratch file in there used to
      // list a blank row sorted by a NaN date; it is a stray file, not mail.
      if (!parsed.from && !parsed.subject) continue;
      entries.push({
        filename: child.name,
        dir: dirName,
        seq: parseInt(seqMatch[1], 10),
        slug: child.name.slice(seqMatch[0].length),
        parsed,
      });
    }
  }

  entries.sort((a, b) => {
    const da = new Date(a.parsed.date).getTime();
    const db = new Date(b.parsed.date).getTime();
    if (da !== db) return da - db;
    return a.seq - b.seq;
  });
  return entries;
}

export function markAsRead(fs: VirtualFS, filename: string): { fs: VirtualFS } {
  const user = usernameFromHomeDir(fs.homeDir);
  const srcPath = `${getNewDir(user)}/${filename}`;
  const readResult = fs.readFile(srcPath);
  if (readResult.error || readResult.content === undefined) {
    return { fs };
  }

  const parsed = parseEmailContent(readResult.content);
  const updatedContent = formatEmailContent(
    {
      id: "",
      from: parsed.from,
      to: parsed.to,
      date: parsed.date,
      subject: parsed.subject,
      body: parsed.body,
      ...(parsed.inReplyTo && { inReplyTo: parsed.inReplyTo }),
    },
    true
  );

  // Write to cur/
  const writeResult = fs.writeFile(`${getCurDir(user)}/${filename}`, updatedContent);
  if (!writeResult.fs) return { fs };

  // Remove from new/
  const removeResult = writeResult.fs.removeNode(srcPath);
  return { fs: removeResult.fs ?? writeResult.fs };
}

/**
 * Has the player already answered this email's reply prompt?
 *
 * Matched on the `X-In-Reply-To:` header the prompt stamps into `sent/`, not on
 * the subject line: a subject scan let a hand-composed
 * `mail -s "Re: <subject>" someone` swallow the real prompt, which soft-locked
 * every beat behind it (the NexaCorp offer most of all).
 */
export function hasReplyToEmail(fs: VirtualFS, username: string, emailId: string): boolean {
  if (!emailId) return false;
  const node = fs.getNode(getSentDir(username));
  if (!node || !isDirectory(node)) return false;
  for (const child of Object.values(node.children)) {
    if (!isFile(child)) continue;
    if (parseEmailContent(child.content).inReplyTo === emailId) return true;
  }
  return false;
}

export function deliverEmail(fs: VirtualFS, email: Email, seq: number): { fs: VirtualFS } {
  const user = usernameFromHomeDir(fs.homeDir);
  const filename = `${String(seq).padStart(3, "0")}_${slugify(email.subject)}`;
  const content = formatEmailContent(email, false);
  const result = fs.writeFile(`${getNewDir(user)}/${filename}`, content);
  return { fs: result.fs ?? fs };
}

export function deliverEmailAsRead(fs: VirtualFS, email: Email, seq: number): { fs: VirtualFS } {
  const user = usernameFromHomeDir(fs.homeDir);
  const filename = `${String(seq).padStart(3, "0")}_${slugify(email.subject)}`;
  const content = formatEmailContent(email, true);
  const result = fs.writeFile(`${getCurDir(user)}/${filename}`, content);
  return { fs: result.fs ?? fs };
}

export function getReadEmailIds(fs: VirtualFS, emails: { id: string; subject: string }[]): Set<string> {
  const readIds = new Set<string>();
  const entries = getMailEntries(fs);
  const readSubjects = new Set(
    entries.filter((e) => e.dir === "cur").map((e) => e.parsed.subject)
  );
  for (const email of emails) {
    if (readSubjects.has(email.subject)) {
      readIds.add(email.id);
    }
  }
  return readIds;
}
