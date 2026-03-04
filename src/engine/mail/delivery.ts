import { VirtualFS } from "../filesystem/VirtualFS";
import { getEmailDefinitions } from "./emails";
import { deliverEmail, getMailEntries } from "./mailUtils";
import { ComputerId, PLAYER } from "../../state/types";

export type GameEvent =
  | { type: "command_executed"; detail: string }
  | { type: "file_read"; detail: string }
  | { type: "objective_completed"; detail: string }
  | { type: "directory_visit"; detail: string };

export function checkEmailDeliveries(
  fs: VirtualFS,
  event: GameEvent,
  deliveredIds: string[],
  computer: ComputerId = "nexacorp"
): { fs: VirtualFS; newDeliveries: string[] } {
  const newDeliveries: string[] = [];
  let currentFs = fs;

  // Determine next sequence number from existing entries
  const existing = getMailEntries(currentFs);
  let nextSeq = existing.length > 0 ? Math.max(...existing.map((e) => e.seq)) + 1 : 1;

  const username = fs.homeDir.split("/").pop() || PLAYER.username;
  for (const def of getEmailDefinitions(username, computer)) {
    if (def.trigger.type === "immediate") continue;
    if (deliveredIds.includes(def.email.id)) continue;
    if (newDeliveries.includes(def.email.id)) continue;

    let matches = false;
    switch (def.trigger.type) {
      case "after_file_read":
        matches = event.type === "file_read" && event.detail === def.trigger.filePath;
        if (matches && def.trigger.requireDelivered) {
          matches = deliveredIds.includes(def.trigger.requireDelivered)
            || newDeliveries.includes(def.trigger.requireDelivered);
        }
        break;
      case "after_email_read":
        matches = event.type === "file_read" && event.detail === def.trigger.emailId;
        break;
      case "after_command":
        matches = event.type === "command_executed" && event.detail === def.trigger.command;
        break;
      case "after_objective":
        matches = event.type === "objective_completed" && event.detail === def.trigger.objectiveId;
        break;
    }

    if (matches) {
      const result = deliverEmail(currentFs, def.email, nextSeq);
      currentFs = result.fs;
      newDeliveries.push(def.email.id);
      nextSeq++;
    }
  }

  return { fs: currentFs, newDeliveries };
}
