import { GameEvent } from "../mail/delivery";

export type CommonTrigger =
  | { type: "immediate" }
  | { type: "after_file_read"; filePath: string; requireDelivered?: string }
  | { type: "after_email_read"; emailId: string }
  | { type: "after_command"; command: string }
  | { type: "after_objective"; objectiveId: string };

export function matchesCommonTrigger(
  trigger: CommonTrigger,
  event: GameEvent,
  deliveredIds: string[],
  newDeliveries: string[]
): boolean {
  switch (trigger.type) {
    case "immediate":
      return false;
    case "after_file_read":
      if (event.type !== "file_read" || event.detail !== trigger.filePath) return false;
      if (trigger.requireDelivered) {
        return deliveredIds.includes(trigger.requireDelivered) || newDeliveries.includes(trigger.requireDelivered);
      }
      return true;
    case "after_email_read":
      return event.type === "file_read" && event.detail === trigger.emailId;
    case "after_command":
      return event.type === "command_executed" && event.detail === trigger.command;
    case "after_objective":
      return event.type === "objective_completed" && event.detail === trigger.objectiveId;
  }
}
