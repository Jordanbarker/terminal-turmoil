import { ChipMenuItem } from "../../engine/chip/types";
import { StoryFlags, ComputerId } from "../../state/types";

const ALL_ITEMS: ChipMenuItem[] = [
  {
    id: "git_help",
    label: "I need help with git",
    condition: (flags, computer) => computer === "devcontainer",
    response:
      "To get the analytics project:\n" +
      "  git clone nexacorp/nexacorp-analytics\n\n" +
      "Some basics:\n" +
      "  git status        Check what's changed\n" +
      "  git add <file>    Stage changes\n" +
      "  git commit -m \"\" Save your work\n" +
      "  git log           View history\n" +
      "  git diff          See what changed",
  },
  {
    id: "clone_for_me",
    label: "Can you clone the repo for me?",
    condition: (flags, computer) =>
      !flags.dbt_project_cloned && computer === "devcontainer",
    response:
      "Sure thing!\n" +
      "\n" +
      "$ git clone nexacorp/nexacorp-analytics\n" +
      "Cloning into 'nexacorp-analytics'...\n" +
      "remote: Enumerating objects: 42\n" +
      "ERROR: Permission denied (publickey).\n" +
      "fatal: Could not read from remote " +
      "repository.\n" +
      "\n" +
      "Hmm, looks like I don't have access. " +
      "You'll need to run it yourself:\n" +
      "  git clone nexacorp/nexacorp-analytics",
  },
  {
    id: "nexacorp",
    label: "Tell me about NexaCorp",
    response:
      "NexaCorp builds AI-powered enterprise tools. I'm the flagship product — a chatbot " +
      "that handles internal processes, documentation, and system queries. The company was " +
      "founded by Jessica Langford, Marcus Reyes, Tom Chen, and Edward Torres. We're still " +
      "about 17 people right now, and growing fast.",
  },
  {
    id: "team",
    label: "Tell me about the team",
    response:
      "Let me pull that up...\n" +
      "\n" +
      "$ snow sql -q \"SELECT full_name, department FROM employees WHERE status = 'active'\"\n" +
      "\n" +
      "  Edward Torres      Executive\n" +
      "  Sarah Knight       Engineering\n" +
      "  Erik Lindstrom     Engineering\n" +
      "  Oscar Diaz         Engineering\n" +
      "  Auri Park          Engineering\n" +
      "  Soham Parekh       Engineering\n" +
      "  Cassie Moreau      Product\n" +
      "  Jordan Kessler     Marketing\n" +
      "  Dana Okafor        Operations\n" +
      "  Maya Johnson       People & Culture\n" +
      "\n" +
      "That's the current active roster. 10 people plus you. The founders " +
      "(Jessica, Marcus, Tom) are in the executive table but I pulled just the day-to-day team.",
  },
  {
    id: "jchen",
    label: "Why did Jin Chen leave?",
    response:
      "Let me check... Employee ID E031, Jin Chen. Department: Engineering. " +
      "Status: resigned, February 2026. That's all I have in the records. " +
      "HR would know more — I just see what's in the database.",
  },
  {
    id: "chip_sa",
    label: "What's the chip_service_account?",
    condition: (flags) => !!flags.found_chip_directives,
    response:
      "That's the service account I use for automated tasks — log rotation, " +
      "ticket triage, system monitoring. Standard stuff for any production service. " +
      "The credentials are shared with authorized engineering personnel for " +
      "maintenance and debugging.",
  },
  {
    id: "chip",
    label: "What exactly do you do here?",
    response:
      "I'm NexaCorp's AI chatbot — the company's flagship product, actually. " +
      "I have access to internal systems — the data warehouse, logs, documentation, email — " +
      "so I can answer questions and help with day-to-day tasks. The team uses me for everything " +
      "from looking up employee info to running system queries.",
  },
  {
    id: "chip_access",
    label: "What can you access?",
    response:
      "I can query the Snowflake data warehouse, check system logs, manage tickets, " +
      "and help with documentation. I also handle some automated maintenance — log rotation, " +
      "monitoring, that kind of thing. If you need data from any of those systems, " +
      "just ask and I can run the query for you.",
  },
  {
    id: "exit",
    label: "Exit",
    response: "",
  },
];

export function getMenuItems(storyFlags: StoryFlags, computer: ComputerId): ChipMenuItem[] {
  return ALL_ITEMS.filter(
    (item) => !item.condition || item.condition(storyFlags, computer)
  );
}
