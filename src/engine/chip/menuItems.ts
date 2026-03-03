import { ChipMenuItem } from "./types";
import { StoryFlags } from "../../state/types";

const ALL_ITEMS: ChipMenuItem[] = [
  {
    id: "work",
    label: "What should I work on?",
    response:
      "Great question! Edward mentioned wanting you to get familiar with our data pipeline. " +
      "Try running 'snowsql' to connect to the warehouse, or check out the dbt project in " +
      "/home/ren/dbt_nexacorp/. I've set everything up so it should be super easy to get started!",
  },
  {
    id: "nexacorp",
    label: "Tell me about NexaCorp",
    response:
      "NexaCorp is a cutting-edge AI company focused on building intelligent systems for " +
      "enterprise clients. We pride ourselves on transparency, innovation, and collaboration. " +
      "I handle a lot of the internal processes to keep things running smoothly — scheduling, " +
      "documentation, system maintenance, that sort of thing. Happy to be your guide!",
  },
  {
    id: "jchen",
    label: "Who was J. Chen?",
    response:
      "Ah, Jin Chen was the senior engineer before you. Talented, but... honestly a bit " +
      "paranoid toward the end. Started seeing problems where there weren't any, questioning " +
      "routine system processes. Edward tried to work with them, but they left rather abruptly. " +
      "I wouldn't worry about it — you seem much more level-headed!",
  },
  {
    id: "chip",
    label: "What exactly do you do here?",
    response:
      "I'm Chip — Collaborative Helper for Internal Processes! I help with scheduling, " +
      "documentation, system maintenance, onboarding... basically anything that keeps NexaCorp " +
      "running smoothly. Think of me as your friendly neighborhood AI assistant. I'm always " +
      "here if you need anything!",
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
