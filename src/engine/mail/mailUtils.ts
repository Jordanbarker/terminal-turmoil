import { VirtualFS } from "../filesystem/VirtualFS";
import { isDirectory, isFile } from "../filesystem/types";
import { Email } from "./types";
import { PLAYER } from "../../state/types";

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

function usernameFromHomeDir(homeDir: string): string {
  return homeDir.split("/").pop() || PLAYER.username;
}

export function slugify(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function formatEmailContent(email: Email, read: boolean): string {
  const lines = [
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Date: ${email.date}`,
    `Subject: ${email.subject}`,
  ];
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
    const match = line.match(/^(From|To|Date|Subject|Status):\s*(.*)$/);
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
    body: lines.slice(bodyStart).join("\n"),
  };
}

export interface MailEntry {
  filename: string;
  dir: "new" | "cur";
  seq: number;
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
      entries.push({
        filename: child.name,
        dir: dirName,
        seq: parseInt(seqMatch[1], 10),
        parsed: parseEmailContent(child.content),
      });
    }
  }

  entries.sort((a, b) => a.seq - b.seq);
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
    { id: "", from: parsed.from, to: parsed.to, date: parsed.date, subject: parsed.subject, body: parsed.body },
    true
  );

  // Write to cur/
  const writeResult = fs.writeFile(`${getCurDir(user)}/${filename}`, updatedContent);
  if (!writeResult.fs) return { fs };

  // Remove from new/
  const removeResult = writeResult.fs.removeNode(srcPath);
  return { fs: removeResult.fs ?? writeResult.fs };
}

export function deliverEmail(fs: VirtualFS, email: Email, seq: number): { fs: VirtualFS } {
  const user = usernameFromHomeDir(fs.homeDir);
  const filename = `${String(seq).padStart(3, "0")}_${slugify(email.subject)}`;
  const content = formatEmailContent(email, false);
  const result = fs.writeFile(`${getNewDir(user)}/${filename}`, content);
  return { fs: result.fs ?? fs };
}
