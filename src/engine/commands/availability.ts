import { ComputerId, StoryFlags } from "../../state/types";
import { HOME_COMMANDS, NEXACORP_GATED, HOME_GATED, DEVCONTAINER_COMMANDS, NEXACORP_ONLY } from "../../story/commandGates";

// Re-export for convenience
export { HOME_COMMANDS, NEXACORP_GATED, HOME_GATED, DEVCONTAINER_COMMANDS, NEXACORP_ONLY };

/** Returns true if the command is available on the given computer. */
export function isCommandAvailable(commandName: string, computer: ComputerId, storyFlags?: StoryFlags): boolean {
  if (computer === "devcontainer") {
    return DEVCONTAINER_COMMANDS.has(commandName);
  }
  if (computer === "nexacorp") {
    const requiredFlag = NEXACORP_GATED[commandName];
    if (requiredFlag && !storyFlags?.[requiredFlag]) return false;
    return true;
  }
  const homeFlag = HOME_GATED[commandName];
  if (homeFlag) {
    if (!storyFlags?.[homeFlag]) return false;
    return true;
  }
  if (HOME_COMMANDS.has(commandName)) return true;
  // Commands unlocked at NexaCorp carry over to home PC (except NexaCorp-only commands)
  if (NEXACORP_ONLY.has(commandName)) return false;
  const nexaFlag = NEXACORP_GATED[commandName];
  if (nexaFlag && storyFlags?.[nexaFlag]) return true;
  return false;
}
