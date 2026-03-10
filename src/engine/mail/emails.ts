import { EmailDelivery } from "./types";
import { ComputerId } from "../../state/types";
import { getHomeEmailDefinitions } from "../../story/emails/home";
import { getNexacorpEmailDefinitions } from "../../story/emails/nexacorp";

export { getNexacorpEmailDefinitions } from "../../story/emails/nexacorp";

export function getEmailDefinitions(username: string, computer: ComputerId = "nexacorp"): EmailDelivery[] {
  return computer === "home"
    ? getHomeEmailDefinitions(username)
    : getNexacorpEmailDefinitions(username);
}
