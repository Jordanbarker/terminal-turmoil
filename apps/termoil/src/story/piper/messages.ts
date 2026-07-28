import { PiperDelivery } from "../../engine/piper/types";
import { getHomeDeliveries } from "./messages/home";
import { getOnboardingDeliveries } from "./messages/onboarding";
import { getOscarDeliveries } from "./messages/oscar";
import { getDanaDeliveries } from "./messages/dana";
import { getAuriDeliveries } from "./messages/auri";
import { getSarahDeliveries } from "./messages/sarah";
import { getCassieDeliveries } from "./messages/cassie";
import { getEdwardDeliveries } from "./messages/edward";
import { getJordanDeliveries } from "./messages/jordan";
import { getMarcusDeliveries } from "./messages/marcus";
import { getMayaDeliveries } from "./messages/maya";
import { getAmbientDeliveries } from "./messages/ambient";
import { getAnonDeliveries } from "./messages/anon";

let cachedUsername: string | undefined;
let cachedDeliveries: PiperDelivery[] | undefined;

export function getPiperDeliveries(username: string): PiperDelivery[] {
  if (username === cachedUsername && cachedDeliveries) return cachedDeliveries;
  cachedUsername = username;
  cachedDeliveries = [
    ...getHomeDeliveries(username),
    ...getOnboardingDeliveries(username),
    ...getOscarDeliveries(username),
    ...getDanaDeliveries(username),
    ...getAuriDeliveries(username),
    ...getJordanDeliveries(username),
    ...getMayaDeliveries(username),
    ...getSarahDeliveries(username),
    ...getCassieDeliveries(username),
    ...getEdwardDeliveries(username),
    ...getMarcusDeliveries(username),
    ...getAnonDeliveries(username),
    ...getAmbientDeliveries(username),
  ];
  return cachedDeliveries;
}
