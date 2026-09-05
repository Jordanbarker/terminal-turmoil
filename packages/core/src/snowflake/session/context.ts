import { getWarehouseIdentity } from "@tt/core/snowflake/identity";

export interface SessionContext {
  currentDatabase: string;
  currentSchema: string;
  currentWarehouse: string;
  currentRole: string;
  currentUser: string;
  /** In-game "now" — when omitted, date functions fall back to real wall-clock time. */
  gameNow?: Date;
}

export function createDefaultContext(username?: string, gameNow?: Date): SessionContext {
  const identity = getWarehouseIdentity();
  return {
    currentDatabase: identity.database,
    currentSchema: identity.analyticsSchema,
    currentWarehouse: identity.warehouse,
    currentRole: identity.defaultRole,
    currentUser: (username ?? "PLAYER").toUpperCase(),
    gameNow,
  };
}
