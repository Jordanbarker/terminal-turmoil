// NexaCorp's Snowflake warehouse identity, injected into the story-agnostic
// @tt/core dbt/snowflake engines at import time (see engine/commands/builtins/index.ts).
import { setWarehouseIdentity } from "@tt/core/snowflake/identity";

setWarehouseIdentity({
  account: "nexacorp.us-east-1",
  accountName: "NEXACORP",
  database: "NEXACORP_PROD",
  analyticsSchema: "ANALYTICS",
  rawSchema: "RAW_NEXACORP",
  warehouse: "NEXACORP_WH",
  defaultRole: "ANALYST",
  dbtRole: "TRANSFORMER",
  dbtProfileName: "nexacorp",
  dbtUser: "chip_service_account",
});
