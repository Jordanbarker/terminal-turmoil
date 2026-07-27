import { ComputerId } from "../state/types";
import type { TermoilStoryFlags } from "./storyFlags";

export interface Checkpoint {
  id: string;
  description: string;
  chapter: string;
  activeComputer: ComputerId;
  /** Typed so a mistyped flag name fails the build instead of silently never firing. */
  storyFlags: TermoilStoryFlags;
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  completedObjectives: string[];
  computers: ComputerId[];
  /** Extra aliases per computer (merged with .zshrc-parsed aliases) */
  aliases?: Partial<Record<ComputerId, Record<string, string>>>;
  /** Extra env vars per computer (merged on top of .zshrc-parsed env) */
  envVars?: Partial<Record<ComputerId, Record<string, string>>>;
}

// ── Checkpoint definitions ──────────────────────────────────────────
// Each builds on the previous via spread (DRY composition).

const DAY1_START: Checkpoint = {
  id: "day1-start",
  description: "First day at NexaCorp (Chapter 2, nexacorp)",
  chapter: "chapter-2",
  activeComputer: "nexacorp",
  storyFlags: {
    // Chapter 1 completion (main path)
    read_resume: true,
    pdftotext_unlocked: true,
    read_nexacorp_offer: true,
    ssh_unlocked: true,
    basic_tools_unlocked: true,
    apt_unlocked: true,
    first_ssh_connect: true,
    // Olive basic challenges flags
    olive_challenges_accepted: true,
    olive_challenges_read: true,
    used_file_in_downloads: true,
    created_projects_dir: true,
    removed_projects_dir: true,
    used_mv_home: true,
    used_echo_pipe: true,
    used_man_command: true,
    // NexaCorp immediate unlocks
    piper_unlocked: true,
    chip_unlocked: true,
  },
  deliveredEmailIds: [
    // Home emails
    "job_board_alert",
    "backup_failure",
    "nexacorp_offer",
    "nexacorp_followup",
    "chip_ssh_setup",
    // NexaCorp immediate emails
    "welcome_edward",
    "it_provisioned",
  ],
  // Reply markers (`reply:<deliveryId>:<index>`) are as load-bearing as the
  // deliveries: an unanswered prompt stays live in the channel. The rule is
  // that only the NEWEST delivery in a channel may still be awaiting a reply.
  // Anything older is backlog the player has visibly moved past, and leaving it
  // pending lets them re-decide a branch this checkpoint already recorded, or
  // re-fire a cascade whose result is already in this list.
  deliveredPiperIds: [
    // Home immediate
    "alex_checkin",
    "reply:alex_checkin:1", // neutral "slowly but I'll get there"
    "olive_linux_basics",
    // `piper_reply:olive_linux_basics` is a completed objective below, so the
    // prompt has to read as answered too.
    "reply:olive_linux_basics:0",
    "bubble_buddies_history",
    // Home triggered
    "alex_nudge_accepted",
    // Accept path: "I GOT THE JOB". Its cascade (alex_react_accepted) is right
    // below, which is the proof this prompt was answered.
    "reply:alex_nudge_accepted:0",
    // Newest in dm_alex at this checkpoint, so deliberately left unanswered.
    "alex_react_accepted",
    "olive_tree_tip",
    "reply:olive_tree_tip:1", // "good tip, thanks" — `tree` is not installed here
    // Olive basic challenges (chapter 1)
    "olive_challenges_intro",
    "reply:olive_challenges_intro:0",
    "olive_challenge_file",
    "reply:olive_challenge_file:0",
    "olive_challenge_mkdir",
    "reply:olive_challenge_mkdir:0",
    "olive_challenge_rm",
    "reply:olive_challenge_rm:0",
    "olive_challenge_mv",
    "reply:olive_challenge_mv:0",
    "olive_challenge_pipe",
    "reply:olive_challenge_pipe:0",
    "olive_challenge_man",
    "reply:olive_challenge_man:0",
    "olive_challenges_complete",
    // NexaCorp immediate
    "general_edward_welcome",
    "reply:general_edward_welcome:0", // said hi; general_tom_wins already landed after it
    "general_tom_wins",
  ],
  completedObjectives: [
    "accepted_nexacorp",
    "piper_reply:olive_linux_basics",
    "piper_reply:olive_challenges_intro",
    "piper_reply:olive_challenge_man",
  ],
  computers: ["home", "nexacorp"],
  aliases: {
    home: { work: "ssh nexacorp" },
  },
};

const DAY1_END: Checkpoint = {
  ...DAY1_START,
  id: "day1-end",
  description: "Day 1 complete, back home (Chapter 2, home)",
  activeComputer: "home",
  storyFlags: {
    ...DAY1_START.storyFlags,
    // Chip fix flow (resolved during day 1)
    chip_error_seen: true,
    printenv_unlocked: true,
    sourced_nexacorp_zshrc: true,
    // Onboarding
    read_onboarding: true,
    read_team_info: true,
    // Oscar quest
    search_tools_unlocked: true,
    tabs_unlocked: true,
    oscar_searched_logs: true,
    oscar_checked_backups: true,
    oscar_diffed_logs: true,
    oscar_access_completed: true,
    // Set by the same beat as oscar_checked_backups / oscar_diffed_logs:
    // reading system.log.bak and diffing it against system.log. Omitting them
    // left the Day 1 investigation half-recorded for anything downstream that
    // gates on the discovery itself rather than on Oscar's quest steps.
    found_backup_files: true,
    discovered_log_tampering: true,
    // Auri quest
    inspection_tools_unlocked: true,
    processing_tools_unlocked: true,
    coder_unlocked: true,
    read_handoff_notes: true,
    auri_listed_handoff: true,
    auri_read_todo: true,
    auri_used_head: true,
    auri_used_tail: true,
    auri_used_wc: true,
    ran_dbt: true,
    dbt_project_cloned: true,
    auri_dbt_reported: true,
    // Olive power tools (derived from piper_delivered trigger)
    olive_power_tools_read: true,
    // End of day
    read_end_of_day: true,
    returned_home_day1: true,
    chmod_unlocked: true,
  },
  deliveredEmailIds: [
    ...DAY1_START.deliveredEmailIds,
    // Triggered during NexaCorp work
    "oscar_coder_setup",
    "maya_welcome",
    "jessica_welcome",
    "tom_welcome",
    "edward_end_of_day",
  ],
  deliveredPiperIds: [
    ...DAY1_START.deliveredPiperIds,
    // Edward chip DM chain (resolved during day 1)
    "edward_chip_intro",
    "reply:edward_chip_intro:0",
    "edward_chip_error",
    "reply:edward_chip_error:0",
    "edward_chip_fix",
    // NexaCorp onboarding triggered
    "eng_sarah_welcome",
    "eng_code_review_debate",
    // Oscar quest. Every prompt here is answered: a delivered-but-pending
    // prompt whose option completes an already-completed objective lets the
    // player re-decide a branch the checkpoint has already recorded (and, for
    // oscar_access_review, record BOTH branches).
    "oscar_log_check",
    "reply:oscar_log_check:0", // took the task; search_tools_tips_requested is not completed
    "oscar_access_review",
    // Branch 0 ("nothing weird"): oscar_logs_normal is completed and Oscar's
    // normal-path follow-up (oscar_log_normal) is what got delivered.
    // discovered_log_tampering is set, so branch 1 is *visible* but was not taken.
    "reply:oscar_access_review:0",
    "oscar_log_normal",
    "reply:oscar_log_normal:0", // took the task; processing_tools_tips_requested is not completed
    "oscar_access_followup",
    // Branch 0 ("that doesn't seem right"): proven by oscar_access_reaction
    // below, which only delivers after oscar_access_suspicious.
    "reply:oscar_access_followup:0",
    "oscar_access_reaction",
    // Auri quest
    "auri_hello",
    "reply:auri_hello:0", // single option; inspection_tools_accepted is completed
    "auri_pipeline_help",
    // Branch 0 (curious about Chen): either branch satisfies handoff_reviewed,
    // so the mystery-forward one is picked to match this checkpoint's
    // investigation flags. Its response chain is what completed
    // pipeline_tools_accepted, so it has to be delivered and answered too.
    "reply:auri_pipeline_help:0",
    "auri_chen_response",
    "reply:auri_chen_response:0",
    "auri_dbt_results",
    // Branch 0 ("some tests warned"): both branches complete auri_dbt_reported,
    // and the Day 1 build really does warn, so the truthful reply is recorded.
    "reply:auri_dbt_results:0",
    "dana_welcome",
    // Home post-day1. alex_react_accepted was the live dm_alex prompt at
    // day1-start; alex_day1_checkin supersedes it, so it gets answered here.
    "reply:alex_react_accepted:0",
    "alex_day1_checkin",
    "openclam_end_of_day",
    "olive_power_tools_intro",
    // Maya DM
    "maya_dm_welcome",
  ],
  completedObjectives: [
    ...DAY1_START.completedObjectives,
    // Onboarding
    "read_welcome_email",
    "read_onboarding",
    "meet_the_team",
    "told_edward_chip_error",
    "try_chip",
    "tell_edward_chip_error",
    "source_zshrc",
    "edward_onboarding",
    // Oscar quest
    "search_tools_accepted",
    "oscar_search_logs",
    "oscar_log_findings_shared",
    "oscar_logs_normal",
    "processing_tools_accepted",
    "oscar_access_reported",
    // The branch objective behind oscar_access_reaction's delivery; recorded so
    // the reply above and the delivery below agree.
    "oscar_access_suspicious",
    "help_oscar_logs",
    // Auri quest
    "inspection_tools_accepted",
    "review_handoff",
    "handoff_reviewed",
    // Branch objective behind auri_chen_response's delivery (see deliveredPiperIds).
    "handoff_curious_about_chen",
    "pipeline_tools_accepted",
    "help_auri_pipeline",
    "clone_analytics_repo",
    "run_dbt",
    "auri_dbt_reported",
    "check_auri_dbt",
    "meet_auri",
    // Closing time
    "read_eod_email",
    "head_home",
    "closing_time",
  ],
  computers: ["home", "nexacorp", "devcontainer"],
  aliases: {
    ...DAY1_START.aliases,
  },
  envVars: {
    nexacorp: { CHIP_API_KEY: "nxa_live_7f3k9m2x" },
  },
};

const DAY2_START: Checkpoint = {
  ...DAY1_END,
  id: "day2-start",
  description: "Day 2, SSH'd back to NexaCorp (Chapter 3, nexacorp)",
  chapter: "chapter-3",
  activeComputer: "nexacorp",
  storyFlags: {
    ...DAY1_END.storyFlags,
    apt_upgraded: true,
    ssh_day2: true,
    day1_shutdown: true,
    anon_tip_quest_started: true,
  },
  deliveredPiperIds: [
    ...DAY1_END.deliveredPiperIds,
    "bubble_buddies_day2_nova",
    "auri_day2_morning",
    "anon_usb_tip",
  ],
  completedObjectives: [
    ...DAY1_END.completedObjectives,
    "update_system",
    "ssh_to_work_day2",
  ],
  aliases: {
    ...DAY1_END.aliases,
  },
};

const DAY2_PIPELINE_FIXED: Checkpoint = {
  ...DAY2_START,
  id: "day2-pipeline-fixed",
  description: "Day 2, pipeline fixed, Edward's plugin DM waiting (Chapter 3, nexacorp)",
  // KNOWN DRIFT (backlog, deliberate): these flags say the player pulled,
  // branched, fixed and pushed, but the devcontainer repo is a fresh clone
  // sitting on `main` at the pre-pull tip, so `git log`/`git branch` do not show
  // that work. Every quest check downstream reads story flags, not repo state,
  // so the arc still resolves; replaying the real git history into a checkpoint
  // would mean building quest-replay machinery for a debug shortcut. Don't.
  storyFlags: {
    ...DAY2_START.storyFlags,
    pulled_day2_updates: true,
    dbt_test_failed_day2: true,
    investigated_null_data: true,
    created_fix_branch: true,
    fixed_campaign_model: true,
    pushed_fix_branch: true,
    reported_fix_to_auri: true,
    // Do NOT set unlock_chip_plugin_development — it fires from the
    // Piper reply to edward_plugin_request, which surfaces the unlock toast.
  },
  deliveredPiperIds: [
    ...DAY2_START.deliveredPiperIds,
    // Auri pipeline-fix arc
    "reply:auri_day2_morning:0",
    "auri_test_failure_reaction",
    "reply:auri_test_failure_reaction:0",
    "auri_test_failure_details",
    // "I'll check it out." — the player then diagnosed the NULLs in the
    // terminal (investigated_null_data), rather than asking Auri to explain.
    "reply:auri_test_failure_details:0",
    "auri_fix_pushed",
    "reply:auri_fix_pushed:0",
    // ...and the cascade that reply triggers (after_piper_reply: auri_fix_pushed)
    "auri_fix_pushed_reply",
    // Edward's plugin request — delivered, awaiting reply
    "edward_plugin_request",
  ],
  completedObjectives: [
    ...DAY2_START.completedObjectives,
    "read_auri_day2_morning",
    "auri_test_failure_reported",
    "pull_day2_updates",
    "discover_test_failure",
    "investigate_null_data",
    "create_fix_branch",
    "fix_the_model",
    "push_fix",
    "report_to_auri",
    "fix_pipeline_quest",
  ],
};

const DAY2_CHAPTER3_MARCUS_DM: Checkpoint = {
  ...DAY2_PIPELINE_FIXED,
  id: "day2-chapter3-marcus-dm",
  description: "Day 2, plugin shipped, Marcus's accusation DM waiting (Chapter 3, nexacorp)",
  storyFlags: {
    ...DAY2_PIPELINE_FIXED.storyFlags,
    // Plugin quest completion
    unlock_chip_plugin_development: true,
    chipinfra_visited: true,
    read_plugin_template: true,
    created_chip_plugin_dir: true,
    wrote_plugin_manifest: true,
    wrote_plugin_skill: true,
    registered_chip_plugin: true,
    reported_plugin_to_edward: true,
    // Intentionally NOT set: accused_* / accusation_made / chapter_3_complete.
    // The cheat drops the player AT the four-way accusation choice.
  },
  deliveredPiperIds: [
    ...DAY2_PIPELINE_FIXED.deliveredPiperIds,
    // Edward plugin chain: request → accept → report → ack
    "reply:edward_plugin_request:0",
    "edward_plugin_report",
    "reply:edward_plugin_report:0",
    "edward_plugin_ack",
    // Marcus opens the accusation DM (trigger: reported_plugin_to_edward)
    "marcus_endgame_opening",
  ],
  completedObjectives: [
    ...DAY2_PIPELINE_FIXED.completedObjectives,
    "accepted_edward_plugin_request",
    "ssh_to_chip_workspace",
    "read_existing_plugin",
    "create_plugin_dir",
    "write_plugin_manifest",
    "write_plugin_skill",
    "register_plugin",
    "report_plugin_to_edward",
    "build_chip_plugin_quest",
  ],
  computers: ["home", "nexacorp", "devcontainer", "chipinfra"],
};

export const CHECKPOINTS: Checkpoint[] = [
  DAY1_START,
  DAY1_END,
  DAY2_START,
  DAY2_PIPELINE_FIXED,
  DAY2_CHAPTER3_MARCUS_DM,
];
