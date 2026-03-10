import { ansi, colorize } from "./ansi";

export const homeWelcome = [
  "",
  `${colorize("Ubuntu 24.04.1 LTS", ansi.brightBlue)} ${colorize("maniac-iv tty1", ansi.dim)}`,
  "",
  `${colorize("Last login: Sat Feb 22 14:32:07 EST 2026 on tty1", ansi.dim)}`,
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
  `  ${colorize("│", ansi.brightCyan)}  ${colorize("Coder Dev Container", ansi.bold)}${" ".repeat(20)}${colorize("│", ansi.brightCyan)}`,
  `  ${colorize("│", ansi.brightCyan)}  ${colorize("Workspace: ai", ansi.dim)}${" ".repeat(26)}${colorize("│", ansi.brightCyan)}`,
  `  ${colorize("│", ansi.brightCyan)}  ${colorize("Tools: dbt, snowsql, python", ansi.dim)}${" ".repeat(12)}${colorize("│", ansi.brightCyan)}`,
  `  ${colorize("│", ansi.brightCyan)}  ${colorize("Type 'exit' to return to NexaCorp", ansi.dim)}${" ".repeat(6)}${colorize("│", ansi.brightCyan)}`,
  `  ${colorize("└──────────────────────────────────────────┘", ansi.brightCyan)}`,
  "",
];

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

