/**
 * App-injected warehouse identity — the account/database/schema/role names the
 * simulated Snowflake warehouse and dbt project present to the player.
 *
 * Core ships story-neutral defaults; a game injects its own names at startup
 * via setWarehouseIdentity() (termoil: src/story/warehouseIdentity.ts). Core
 * code must never hardcode a story-specific warehouse name — read the current
 * identity through getWarehouseIdentity() instead.
 */
export interface WarehouseIdentity {
  /** Full account locator, "<account>.<region>" (CURRENT_ACCOUNT / CURRENT_REGION). */
  account: string;
  /** Uppercase account name used in error messages and SHOW GRANTS rows. */
  accountName: string;
  /** Default database. */
  database: string;
  /** Schema dbt models materialize into. */
  analyticsSchema: string;
  /** Schema holding raw source tables. */
  rawSchema: string;
  /** Default warehouse. */
  warehouse: string;
  /** Default session role. */
  defaultRole: string;
  /** Service role dbt runs as. */
  dbtRole: string;
  /** dbt profile name (dbt debug output). */
  dbtProfileName: string;
  /** Service account user dbt connects as (dbt debug output). */
  dbtUser: string;
}

const DEFAULT_IDENTITY: WarehouseIdentity = {
  account: "local.us-east-1",
  accountName: "LOCAL",
  database: "PROD",
  analyticsSchema: "ANALYTICS",
  rawSchema: "RAW",
  warehouse: "WH",
  defaultRole: "ANALYST",
  dbtRole: "TRANSFORMER",
  dbtProfileName: "default",
  dbtUser: "dbt_service_account",
};

let current: WarehouseIdentity = DEFAULT_IDENTITY;

export function setWarehouseIdentity(identity: WarehouseIdentity): void {
  current = identity;
}

export function resetWarehouseIdentity(): void {
  current = DEFAULT_IDENTITY;
}

export function getWarehouseIdentity(): WarehouseIdentity {
  return current;
}
