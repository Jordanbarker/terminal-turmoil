import { ChipMenuItem } from "./types";
import { StoryFlags } from "../../state/types";

const ALL_ITEMS: ChipMenuItem[] = [
  {
    id: "work",
    label: "What should I work on?",
    response:
      "Edward mentioned wanting you to get familiar with our data pipeline. " +
      "I can clone the dbt repo for you — just pick that option below. " +
      "Auri Park was managing the models before you — might be worth looking at what's there.",
  },
  {
    id: "clone_repo",
    label: "Clone the dbt repo for me",
    condition: (flags) => !flags.dbt_project_cloned,
    response:
      "On it! Pulling the repo now...\n" +
      "\n" +
      "$ git clone nexacorp/analytics\n" +
      "Cloning into 'nexacorp-analytics'...\n" +
      "remote: Enumerating objects: 42\n" +
      "remote: Counting objects: 100%\n" +
      "remote: Compressing objects: 100%\n" +
      "Receiving objects: 100%, done.\n" +
      "Resolving deltas: 100%, done.\n" +
      "\n" +
      "All set! The project is at\n" +
      "~/nexacorp-analytics/. Try 'dbt build'\n" +
      "to run the full pipeline.",
    triggerEvents: [{ type: "objective_completed", detail: "dbt_project_cloned" }],
  },
  {
    id: "git_access",
    label: "Can I manage git myself?",
    condition: (flags) =>
      typeof flags.used_chip_topics === "string" &&
      flags.used_chip_topics.split(",").includes("clone_repo"),
    response:
      "I handle all git operations for the " +
      "engineering team — cloning, pulling, " +
      "pushing, branch management. It's part " +
      "of our security and compliance setup. " +
      "Keeps things auditable and prevents " +
      "accidental force-pushes or leaks. Just " +
      "let me know whenever you need a repo " +
      "and I'll take care of it!",
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
    id: "jchen",
    label: "Who was Jin Chen?",
    response:
      "Let me check... Jin Chen, Engineering department, employee ID E031. Status: terminated, " +
      "February 2026. That's all I have in the employee records. You'd have to ask Edward " +
      "or HR for more context — I just see what's in the database.",
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
    id: "exit",
    label: "Exit",
    response: "",
  },
];

export function getMenuItems(storyFlags: StoryFlags): ChipMenuItem[] {
  return ALL_ITEMS.filter(
    (item) => !item.condition || item.condition(storyFlags)
  );
}
