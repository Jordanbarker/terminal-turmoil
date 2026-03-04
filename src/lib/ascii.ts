import { ansi, colorize } from "./ansi";

export const homeWelcome = [
  "",
  `${colorize("Ubuntu 24.04.1 LTS", ansi.brightBlue)} ${colorize("maniac-iv tty1", ansi.dim)}`,
  "",
  `${colorize("Last login: Sat Feb 22 14:32:07 EST 2026 on tty1", ansi.dim)}`,
  "",
  `Opening ${colorize("terminal_notes.txt", ansi.green)} in nano...`,
  "",
];

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
    `${colorize(`Last login: Mon Feb 24 08:47:12 2026 from 73.162.44.18`, ansi.dim)}`,
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

