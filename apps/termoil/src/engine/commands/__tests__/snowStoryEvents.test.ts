import { describe, it, expect } from "vitest";
import "../builtins";
import { execute } from "@tt/core/commands/registry";
import { CommandContext } from "@tt/core/commands/types";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { dir } from "@tt/core/filesystem/builders";
import { createInitialSnowflakeState } from "@/story/data/snowflake/initial_data";
import { createDefaultContext } from "@tt/core/snowflake/session/context";
import { checkStoryFlagTriggers } from "../../narrative/storyFlags";
import { getDevcontainerStoryFlagTriggers } from "../../../story/storyFlags";

/**
 * A `snow sql -q` that errors shows the player no data, so it must credit no
 * investigation: the campaign_metrics detection used to run before the error
 * check, which completed Jordan's inflated-metrics quest (and Day 2's
 * investigated_null_data) off a query that never returned a row.
 */
function snowCtx(): CommandContext {
  const fs = new VirtualFS(dir("/", { home: dir("home", { ren: dir("ren", {}) }) }), "/home/ren", "/home/ren");
  return {
    fs,
    cwd: "/home/ren",
    homeDir: "/home/ren",
    username: "ren",
    activeComputer: "devcontainer",
    envVars: {},
    snowflakeState: createInitialSnowflakeState(),
    snowflakeContext: createDefaultContext(),
  };
}

const run = (sql: string) => execute("snow", ["sql", sql], { q: true }, snowCtx());

describe("snow sql -q campaign_metrics detection", () => {
  it("emits no story event when the query errors", () => {
    const result = run("SELECT * FROM raw_nexacorp.campaign_metrics WHERE");
    expect(result.exitCode).toBe(1);
    expect(result.triggerEvents).toBeUndefined();
  });

  it("emits no story event when the table reference is wrong", () => {
    const result = run("SELECT * FROM nope.campaign_metrics");
    expect(result.exitCode).toBe(1);
    expect(result.triggerEvents).toBeUndefined();
  });

  it("emits the event for a query that actually returns rows", () => {
    const result = run("SELECT * FROM raw_nexacorp.campaign_metrics LIMIT 1");
    expect(result.exitCode).toBe(0);
    expect(result.triggerEvents).toContainEqual({
      type: "command_executed",
      detail: "queried_campaign_metrics",
    });
  });
});

describe("day-2 investigated_null_data is not credited by a failed query", () => {
  const triggers = getDevcontainerStoryFlagTriggers("ren");
  const flags = { dbt_test_failed_day2: true };

  it("sets nothing when the query errored (no event to match)", () => {
    const result = run("SELECT * FROM raw_nexacorp.campaign_metrics WHERE");
    for (const event of result.triggerEvents ?? []) {
      expect(checkStoryFlagTriggers(event, triggers, flags)).toEqual([]);
    }
  });

  it("sets investigated_null_data once the query runs", () => {
    const result = run("SELECT * FROM raw_nexacorp.campaign_metrics LIMIT 1");
    const set = (result.triggerEvents ?? []).flatMap((e) => checkStoryFlagTriggers(e, triggers, flags));
    expect(set.map((s) => s.flag)).toContain("investigated_null_data");
  });
});
