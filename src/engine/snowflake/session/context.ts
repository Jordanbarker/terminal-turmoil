export interface SessionContext {
  currentDatabase: string;
  currentSchema: string;
  currentWarehouse: string;
  currentRole: string;
  currentUser: string;
}

export function createDefaultContext(username?: string): SessionContext {
  return {
    currentDatabase: "NEXACORP_DB",
    currentSchema: "PUBLIC",
    currentWarehouse: "NEXACORP_WH",
    currentRole: "TRANSFORMER",
    currentUser: (username ?? "PLAYER").toUpperCase(),
  };
}
