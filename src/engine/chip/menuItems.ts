import { ChipMenuItem } from "./types";
import { StoryFlags } from "../../state/types";

const ALL_ITEMS: ChipMenuItem[] = [
  {
    id: "work",
    label: "What should I work on?",
    response:
      "Edward mentioned wanting you to get familiar with our data pipeline. " +
      "The dbt project is in ~/nexacorp-analytics/, and you can connect to the warehouse with 'snowsql'. " +
      "Auri Park was managing the models before you — might be worth looking at what's there.",
  },
  {
    id: "nexacorp",
    label: "Tell me about NexaCorp",
    response:
      "NexaCorp builds AI-powered enterprise tools. I'm the flagship product — a chatbot " +
      "that handles internal processes, documentation, and system queries. The company was " +
      "founded by Jessica Langford, Marcus Reyes, Tom Chen, and Edward Torres. We're still " +
      "about 80 people right now, and growing fast.",
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
