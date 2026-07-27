import { describe, it, expect } from "vitest";
import { checkStoryFlagTriggers } from "../storyFlags";
import {
  getStoryFlagTriggers,
  getDevcontainerStoryFlagTriggers,
  getNexacorpStoryFlagTriggers,
} from "../../../story/storyFlags";
import { HOME_PATHS } from "../../../story/filesystem/paths";
import { GameEvent } from "../../mail/delivery";
import { StoryFlags } from "../../../state/types";

const username = "ren";

function fired(event: GameEvent, triggers: ReturnType<typeof getStoryFlagTriggers>, flags: StoryFlags): string[] {
  return checkStoryFlagTriggers(event, triggers, flags).map((r) => r.flag);
}

/**
 * Each of these covers a trigger that used to fire on evidence the objective
 * did not actually ask for: reading a file the player never wrote, sourcing a
 * config that set nothing, pushing a branch nobody asked about.
 */

describe("created_backup_log — Olive's step 3 is a write, not a read", () => {
  const triggers = getStoryFlagTriggers(username);
  const log = HOME_PATHS.backupLog(username);

  it("fires on the first append (file_created)", () => {
    expect(fired({ type: "file_created", detail: log }, triggers, {})).toContain("created_backup_log");
  });

  it("fires on a later append to an existing log (file_modified)", () => {
    expect(fired({ type: "file_modified", detail: log }, triggers, {})).toContain("created_backup_log");
  });

  it("does not fire from merely reading the log", () => {
    expect(fired({ type: "file_read", detail: log }, triggers, {})).not.toContain("created_backup_log");
  });

  it("does not fire for a different file", () => {
    const other = `/home/${username}/notes.txt`;
    expect(fired({ type: "file_created", detail: other }, triggers, {})).not.toContain("created_backup_log");
  });
});

describe("pushed_fix_branch — the branch pushed has to be the fix branch", () => {
  const triggers = getDevcontainerStoryFlagTriggers(username);
  const ready: StoryFlags = { dbt_test_failed_day2: true, fixed_campaign_model: true };
  const push = (detail: string): GameEvent => ({ type: "command_executed", detail });

  it("fires for the player's own fix branch, whatever they named it", () => {
    expect(fired(push("git_push_origin_fix/null-data"), triggers, ready)).toContain("pushed_fix_branch");
    expect(fired(push("git_push_origin_auri-fix"), triggers, ready)).toContain("pushed_fix_branch");
  });

  it("does not fire for a push of main", () => {
    expect(fired(push("git_push_origin_main"), triggers, ready)).not.toContain("pushed_fix_branch");
  });

  it("does not fire for the branch-less `git_push` event alone", () => {
    expect(fired(push("git_push"), triggers, ready)).not.toContain("pushed_fix_branch");
  });

  it("still requires the model fix first", () => {
    expect(fired(push("git_push_origin_fix/null-data"), triggers, { dbt_test_failed_day2: true }))
      .not.toContain("pushed_fix_branch");
  });
});

describe("sourced_nexacorp_zshrc — the key has to land, not just be sourced", () => {
  const triggers = getNexacorpStoryFlagTriggers(username);
  const ready: StoryFlags = { printenv_unlocked: true };

  it("fires on the env-assignment event the export/source seam emits", () => {
    const event: GameEvent = { type: "command_executed", detail: "exported_chip_api_key" };
    expect(fired(event, triggers, ready)).toContain("sourced_nexacorp_zshrc");
  });

  it("no longer fires on the act of sourcing a .zshrc", () => {
    const event: GameEvent = { type: "command_executed", detail: "sourced_zshrc" };
    expect(fired(event, triggers, ready)).not.toContain("sourced_nexacorp_zshrc");
  });
});
