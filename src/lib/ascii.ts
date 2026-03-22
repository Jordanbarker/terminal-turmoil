import { ansi, colorize } from "./ansi";
import { IncrementalLine } from "../engine/commands/types";

const HOME_LAST_LOGINS: Record<number, string> = {
  1: "Last login: Sun Feb 22 14:32:07 EST 2026 on tty1",
  2: "Last login: Tue Feb 24 19:12:33 EST 2026 on tty1",
};

export function getHomeWelcome(day = 1): string[] {
  const lastLogin = HOME_LAST_LOGINS[day] ?? HOME_LAST_LOGINS[1];
  return [
    "",
    `${colorize("Ubuntu 24.04.1 LTS", ansi.brightBlue)} ${colorize("maniac-iv tty1", ansi.dim)}`,
    "",
    `${colorize(lastLogin, ansi.dim)}`,
    "",
  ];
}

export const homeWelcome = getHomeWelcome(1);

export const UNLOCK_BOX = [
  "",
  `  ${colorize("┌─────────────────────────────────────────┐", ansi.cyan)}`,
  `  ${colorize("│", ansi.cyan)}  ${colorize("Additional tools available.", ansi.bold)}${" ".repeat(12)}${colorize("│", ansi.cyan)}`,
  `  ${colorize("│", ansi.cyan)}  Type ${colorize("'help'", ansi.green)} to see all commands.${" ".repeat(7)}${colorize("│", ansi.cyan)}`,
  `  ${colorize("└─────────────────────────────────────────┘", ansi.cyan)}`,
  "",
];

export function getShutdownSequence(): string[] {
  return [
    "",
    `${colorize("Shutting down...", ansi.dim)}`,
    "",
    `${colorize("[  OK  ]", ansi.green)} Stopped user session`,
    `${colorize("[  OK  ]", ansi.green)} Unmounted /home`,
    `${colorize("[  OK  ]", ansi.green)} Reached target shutdown`,
    "",
  ];
}

export function getShutdownIncrementalLines(withCountdown: boolean): IncrementalLine[] {
  const lines: IncrementalLine[] = [];

  if (withCountdown) {
    lines.push({ text: "", delayMs: 0 });
    lines.push({
      text: colorize("Broadcast message from root@maniac-iv:", ansi.yellow),
      delayMs: 200,
    });
    lines.push({
      text: colorize("The system is going down for poweroff in 1 minute!", ansi.yellow),
      delayMs: 200,
    });
    lines.push({ text: "", delayMs: 0 });
    lines.push({ text: colorize("Shutdown in 45s...", ansi.dim), delayMs: 15000 });
    lines.push({ text: colorize("Shutdown in 30s...", ansi.dim), delayMs: 15000 });
    lines.push({ text: colorize("Shutdown in 15s...", ansi.dim), delayMs: 15000 });
    lines.push({ text: "", delayMs: 15000 });
  }

  // Systemd shutdown lines from getShutdownSequence
  const shutdownLines = getShutdownSequence();
  for (const line of shutdownLines) {
    lines.push({ text: line, delayMs: 100 });
  }

  lines.push({ text: colorize("Powering off...", ansi.dim + ansi.bold), delayMs: 500 });

  return lines;
}

export const nexacorpLogo = [
  "",
  `  ${colorize("███╗   ██╗███████╗██╗  ██╗ █████╗  ██████╗ ██████╗ ██████╗ ██████╗", ansi.cyan)}`,
  `  ${colorize("████╗  ██║██╔════╝╚██╗██╔╝██╔══██╗██╔════╝██╔═══██╗██╔══██╗██╔══██╗", ansi.cyan)}`,
  `  ${colorize("██╔██╗ ██║█████╗   ╚███╔╝ ███████║██║     ██║   ██║██████╔╝██████╔╝", ansi.brightCyan)}`,
  `  ${colorize("██║╚██╗██║██╔══╝   ██╔██╗ ██╔══██║██║     ██║   ██║██╔══██╗██╔═══╝", ansi.cyan)}`,
  `  ${colorize("██║ ╚████║███████╗██╔╝ ██╗██║  ██║╚██████╗╚██████╔╝██║  ██║██║", ansi.cyan)}`,
  `  ${colorize("╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝", ansi.brightBlack)}`,
  "",
  `  ${colorize("Internal Systems Portal v4.7.2", ansi.brightBlack)}`,
  `  ${colorize("Authorized access only. All activity is monitored.", ansi.brightBlack)}`,
  "",
];

export function getSshConnectionSequence(username: string): string[] {
  return [
    "",
    `${colorize(`Authenticated to nexacorp-ws01.nexacorp.internal ([10.0.1.47]:22) using "publickey".`, ansi.dim)}`,
    `${colorize(`Last login: Tue Feb 24 08:47:12 2026 from 73.162.44.18`, ansi.dim)}`,
    "",
  ];
}

export function getCoderConnectionSequence(): string[] {
  return [
    "",
    `${colorize("Connecting to workspace 'ai'...", ansi.dim)}`,
    `${colorize("Starting workspace agent...", ansi.dim)}`,
    `${colorize("Waiting for network...", ansi.dim)}`,
    `${colorize("Workspace ready.", ansi.green)}`,
  ];
}

export const coderBanner = [
  `  ${colorize("┌──────────────────────────────────────────┐", ansi.brightCyan)}`,
  `  ${colorize("│", ansi.brightCyan)}  ${colorize("Coder Dev Container", ansi.bold)}${" ".repeat(21)}${colorize("│", ansi.brightCyan)}`,
  `  ${colorize("│", ansi.brightCyan)}  ${colorize("Workspace: ai", ansi.dim)}${" ".repeat(27)}${colorize("│", ansi.brightCyan)}`,
  `  ${colorize("│", ansi.brightCyan)}  ${colorize("Tools: dbt, snow, python", ansi.dim)}${" ".repeat(16)}${colorize("│", ansi.brightCyan)}`,
  `  ${colorize("│", ansi.brightCyan)}  ${colorize("Type 'exit' to return to NexaCorp", ansi.dim)}${" ".repeat(7)}${colorize("│", ansi.brightCyan)}`,
  `  ${colorize("└──────────────────────────────────────────┘", ansi.brightCyan)}`,
  "",
];

export function getHomeBootSequence(): string[] {
  return [
    colorize("BIOS POST... OK", ansi.dim),
    colorize("Loading Linux 6.8.0-49-generic ...", ansi.dim),
    "",
    `${colorize("[  OK  ]", ansi.green)} Reached target - Local File Systems.`,
    `${colorize("[  OK  ]", ansi.green)} Started systemd-journald.service - Journal Service.`,
    `${colorize("[  OK  ]", ansi.green)} Started NetworkManager.service - Network Manager.`,
    `${colorize("[  OK  ]", ansi.green)} Reached target - Network.`,
    `${colorize("[  OK  ]", ansi.green)} Started systemd-logind.service - User Login Management.`,
    `${colorize("[  OK  ]", ansi.green)} Started getty@tty1.service - Getty on tty1.`,
    "",
  ];
}

export function getBootSequence(username: string) {
  return [
  `${colorize("[  OK  ]", ansi.green)} Starting NexaCorp session manager...`,
  `${colorize("[  OK  ]", ansi.green)} Mounting user environment /home/${username}`,
  `${colorize("[  OK  ]", ansi.green)} Loading Chip AI assistant...`,
  `${colorize("[  OK  ]", ansi.green)} Synchronizing project repositories...`,
  `${colorize("[  OK  ]", ansi.green)} Applying security policies...`,
  `${colorize("[  OK  ]", ansi.green)} Session ready.`,
];
}

