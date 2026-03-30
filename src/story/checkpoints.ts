import { ComputerId, StoryFlags } from "../state/types";

export interface Checkpoint {
  id: string;
  description: string;
  chapter: string;
  activeComputer: ComputerId;
  storyFlags: StoryFlags;
  deliveredEmailIds: string[];
  deliveredPiperIds: string[];
  completedObjectives: string[];
  computers: ComputerId[];
  /** Pre-seeded command history per computer (QoL for checkpoint users) */
  commandHistory?: Partial<Record<ComputerId, string[]>>;
  /** Extra aliases per computer (merged with .zshrc-parsed aliases) */
  aliases?: Partial<Record<ComputerId, Record<string, string>>>;
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
    // NexaCorp immediate unlocks
    piper_unlocked: true,
    chip_unlocked: true,
  },
  deliveredEmailIds: [
    // Home emails
    "job_board_alert",
    "cron_backup_failure",
    "nexacorp_offer",
    "nexacorp_followup",
    "chip_ssh_setup",
    // NexaCorp immediate emails
    "welcome_edward",
    "it_provisioned",
    "chip_intro",
  ],
  deliveredPiperIds: [
    // Home immediate
    "alex_checkin",
    "olive_linux_basics",
    "bubble_buddies_history",
    // Home triggered
    "alex_nudge_accepted",
    "alex_react_accepted",
    "olive_tree_tip",
    // NexaCorp immediate
    "general_edward_welcome",
    "general_tom_wins",
  ],
  completedObjectives: [
    "accepted_nexacorp",
    "piper_reply:olive_linux_basics",
  ],
  computers: ["home", "nexacorp"],
  commandHistory: {
    home: ["ssh nexacorp"],
  },
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
    "edward_handoff_suggestion",
    "jessica_welcome",
    "tom_welcome",
    "edward_end_of_day",
  ],
  deliveredPiperIds: [
    ...DAY1_START.deliveredPiperIds,
    // NexaCorp onboarding triggered
    "eng_sarah_welcome",
    "eng_code_review_debate",
    // Oscar quest
    "oscar_log_check",
    "oscar_tab_tip",
    "oscar_access_review",
    "oscar_log_normal",
    "oscar_access_followup",
    "oscar_access_reaction",
    // Auri quest
    "auri_hello",
    "auri_pipeline_help",
    "auri_dbt_results",
    "dana_welcome",
    // Home post-day1
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
    "edward_onboarding",
    // Oscar quest
    "search_tools_accepted",
    "oscar_search_logs",
    "oscar_log_findings_shared",
    "oscar_logs_normal",
    "processing_tools_accepted",
    "oscar_access_reported",
    "help_oscar_logs",
    // Auri quest
    "inspection_tools_accepted",
    "review_handoff",
    "handoff_reviewed",
    "pipeline_tools_accepted",
    "help_auri_pipeline",
    "clone_analytics_repo",
    "run_dbt",
    "auri_dbt_reported",
    "check_auri_dbt",
    "meet_auri",
    // Closing time
    "check_eod_email",
    "read_eod_email",
    "head_home",
    "closing_time",
  ],
  computers: ["home", "nexacorp", "devcontainer"],
  commandHistory: {
    home: [...(DAY1_START.commandHistory?.home ?? []), "exit"],
  },
  aliases: {
    ...DAY1_START.aliases,
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
  },
  deliveredPiperIds: [
    ...DAY1_END.deliveredPiperIds,
    "bubble_buddies_day2_nova",
    "auri_day2_morning",
  ],
  completedObjectives: [
    ...DAY1_END.completedObjectives,
    "update_system",
    "ssh_to_work_day2",
  ],
  commandHistory: {
    home: [...(DAY1_END.commandHistory?.home ?? []), "sudo apt update && sudo apt upgrade -y", "ssh nexacorp"],
  },
  aliases: {
    ...DAY1_END.aliases,
  },
};

export const CHECKPOINTS: Checkpoint[] = [DAY1_START, DAY1_END, DAY2_START];
