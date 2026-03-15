import type { ComputerId } from "../state/types";
import { HOME_PATHS, NEXACORP_PATHS } from "./filesystem/paths";

export interface StoryFlagTrigger {
  event: "file_read" | "command_executed" | "directory_visit" | "directory_created" | "piper_delivered" | "objective_completed";
  path?: string;
  detail?: string;
  flag: StoryFlagName;
  value: string | boolean;
  toast?: string;
}

export const STORY_FLAG_NAMES = [
  "read_resume",
  "read_cover_letter",
  "read_diary",
  "read_job_notes",
  "read_glassdoor",
  "research_depth",
  "read_auto_apply",
  "read_bashrc",
  "read_cron_backup",
  "fixed_backup_script",
  "ran_auto_apply",
  "pdftotext_unlocked",
  "tree_installed",
  "found_backup_files",
  "found_auth_backup",
  "found_chip_directives",
  "found_cleanup_script",
  "read_onboarding",
  "read_team_info",
  "read_handoff_notes",
  "chip_unlocked",
  "ran_dbt",
  "found_data_filtering",
  "read_nexacorp_offer",
  "commands_unlocked",
  "ssh_unlocked",
  "apt_unlocked",
  "basic_tools_unlocked",
  "devcontainer_visited",

  "search_tools_unlocked",
  "inspection_tools_unlocked",
  "processing_tools_unlocked",
  "pipeline_tools_unlocked",
  "coder_unlocked",
  "piper_unlocked",

  "oscar_searched_logs",
  "oscar_checked_backups",
  "oscar_diffed_logs",
  "auri_used_head",
  "auri_used_tail",
  "auri_used_wc",

  "read_end_of_day",
  "returned_home_day1",
  "chmod_unlocked",
  "read_ticket_export",
  "read_board_minutes",
  "read_headcount_plan",

  "discovered_log_tampering",
  "found_inflated_metrics",
  "used_chip_topics",
  "dbt_project_cloned",

  // Quest 1: Olive's Terminal Challenges
  "olive_challenges_read",
  "used_file_on_deb",
  "used_which_python",
  "created_projects_dir",
  "used_mv_home",
  "used_echo_pipe",
  "used_man_command",

  // Quest 2: Digital Spring Cleaning
  "cleanup_quest_started",
  "found_synthetica_dir",
  "found_synthetica_cache",
  "found_tmp_remnant",
  "used_rm_cleanup",
  "checked_malware_date",

  // Quest 3: Fix & Extend Backup
  "backup_quest_started",
  "created_backups_dir",
  "copied_scripts_backup",
  "created_backup_log",
  "verified_backup",

  // Quest 4: Olive's Power Tools (post day 1)
  "olive_power_tools_read",
  "used_grep_at_home",
  "used_wc_at_home",
  "used_history_redirect",
  "used_sort_uniq_home",
  "used_find_home",

  // Salary negotiation
  "accepted_at_180k",
] as const;

export type StoryFlagName = (typeof STORY_FLAG_NAMES)[number];

export function getStoryFlagTriggers(username: string): StoryFlagTrigger[] {
  const p = HOME_PATHS;
  return [
    { event: "file_read", path: p.resume(username), flag: "read_resume", value: true },
    { event: "file_read", path: p.coverLetter(username), flag: "read_cover_letter", value: true },
    { event: "file_read", path: p.diary(username), flag: "read_diary", value: true },
    { event: "file_read", path: p.jobNotes(username), flag: "read_job_notes", value: true },
    { event: "file_read", path: p.glassdoorReviews(username), flag: "read_glassdoor", value: true },
    { event: "file_read", path: p.glassdoorReviews(username), flag: "research_depth", value: "deep" },
    { event: "file_read", path: p.autoApply(username), flag: "read_auto_apply", value: true },
    { event: "file_read", path: p.bashrc(username), flag: "read_bashrc", value: true },
    { event: "directory_visit", path: p.downloadsDir(username), flag: "pdftotext_unlocked", value: true, toast: "pdftotext command unlocked!" },
    { event: "file_read", path: p.resume(username), flag: "pdftotext_unlocked", value: true, toast: "pdftotext command unlocked!" },
    { event: "file_read", path: p.jobJd(username), flag: "pdftotext_unlocked", value: true, toast: "pdftotext command unlocked!" },
    { event: "command_executed", detail: "apt_install_tree", flag: "tree_installed", value: true, toast: "tree command installed!" },
    { event: "file_read", detail: "nexacorp_offer", flag: "read_nexacorp_offer", value: true },
    { event: "file_read", detail: "chip_ssh_setup", flag: "ssh_unlocked", value: true, toast: "ssh command unlocked!" },
    { event: "objective_completed", detail: "piper_reply:olive_linux_basics", flag: "basic_tools_unlocked", value: true, toast: "Basic Linux commands unlocked!" },
    { event: "piper_delivered", detail: "olive_tree_tip", flag: "apt_unlocked", value: true, toast: "sudo and apt commands unlocked!" },
    { event: "file_read", detail: "cron_backup_failure", flag: "read_cron_backup", value: true },
    { event: "file_read", detail: "fixed_backup_script", flag: "fixed_backup_script", value: true },
    { event: "command_executed", detail: "ran_auto_apply", flag: "ran_auto_apply", value: true },
    { event: "objective_completed", detail: "salary_180k", flag: "accepted_at_180k", value: true },

    // Quest 1: Olive's Terminal Challenges
    { event: "piper_delivered", detail: "olive_challenge_file", flag: "olive_challenges_read", value: true },
    { event: "file_read", path: p.zoomDeb(username), flag: "used_file_on_deb", value: true },
    { event: "file_read", path: p.pipDeb(username), flag: "used_file_on_deb", value: true },
    { event: "command_executed", detail: "which_python", flag: "used_which_python", value: true },
    { event: "directory_created", path: p.projectsDir(username), flag: "created_projects_dir", value: true },
    { event: "command_executed", detail: "mv", flag: "used_mv_home", value: true },
    { event: "command_executed", detail: "echo_pipe", flag: "used_echo_pipe", value: true },
    { event: "command_executed", detail: "man", flag: "used_man_command", value: true },

    // Quest 2: Digital Spring Cleaning
    { event: "piper_delivered", detail: "alex_cleanup_nudge", flag: "cleanup_quest_started", value: true },
    { event: "directory_visit", path: p.syntheticaDir(username), flag: "found_synthetica_dir", value: true },
    { event: "file_read", path: p.syntheticaHeartbeat(username), flag: "found_synthetica_cache", value: true },
    { event: "file_read", path: p.synthEvalPipe(), flag: "found_tmp_remnant", value: true },
    { event: "command_executed", detail: "rm", flag: "used_rm_cleanup", value: true },
    { event: "command_executed", detail: "date", flag: "checked_malware_date", value: true },

    // Quest 3: Fix & Extend Backup
    { event: "piper_delivered", detail: "olive_backup_advice", flag: "backup_quest_started", value: true },
    { event: "directory_created", path: p.backupsDir(username), flag: "created_backups_dir", value: true },
    { event: "command_executed", detail: "cp", flag: "copied_scripts_backup", value: true },
    { event: "file_read", path: p.backupLog(username), flag: "created_backup_log", value: true },
    { event: "file_read", path: p.backupsScripts(username), flag: "verified_backup", value: true },

    // Quest 4: Olive's Power Tools (post day 1)
    { event: "piper_delivered", detail: "olive_power_tools_intro", flag: "olive_power_tools_read", value: true },
    { event: "command_executed", detail: "grep", flag: "used_grep_at_home", value: true },
    { event: "command_executed", detail: "wc",   flag: "used_wc_at_home",   value: true },
    { event: "file_read", path: p.myCommandsTxt(username), flag: "used_history_redirect", value: true },
    { event: "command_executed", detail: "uniq", flag: "used_sort_uniq_home", value: true },
    { event: "command_executed", detail: "find", flag: "used_find_home",      value: true },
  ];
}

export function getNexacorpStoryFlagTriggers(_username: string): StoryFlagTrigger[] {
  const p = NEXACORP_PATHS;
  return [
    { event: "file_read", path: p.systemLog, flag: "oscar_searched_logs", value: true },
    { event: "file_read", path: p.systemLogBak, flag: "oscar_checked_backups", value: true },
    { event: "command_executed", detail: "diff", flag: "oscar_diffed_logs", value: true },
    { event: "command_executed", detail: "head", flag: "auri_used_head", value: true },
    { event: "command_executed", detail: "tail", flag: "auri_used_tail", value: true },
    { event: "command_executed", detail: "wc", flag: "auri_used_wc", value: true },
    { event: "file_read", path: p.systemLogBak, flag: "found_backup_files", value: true },
    { event: "file_read", path: p.authLogBak, flag: "found_auth_backup", value: true },
    { event: "file_read", path: p.chipDirectives, flag: "found_chip_directives", value: true },
    { event: "file_read", path: p.chipCleanup, flag: "found_cleanup_script", value: true },
    { event: "file_read", path: p.onboarding, flag: "read_onboarding", value: true },
    { event: "file_read", detail: "oscar_coder_setup", flag: "coder_unlocked", value: true, toast: "coder command unlocked! Try: coder ssh ai" },
    { event: "file_read", path: p.teamInfo, flag: "read_team_info", value: true },
    { event: "file_read", path: p.handoffNotes, flag: "read_handoff_notes", value: true },
    { event: "file_read", detail: "chip_intro", flag: "chip_unlocked", value: true, toast: "chip command unlocked!" },
    { event: "file_read", detail: "welcome_edward", flag: "piper_unlocked", value: true, toast: "piper command unlocked!" },
    { event: "file_read", detail: "edward_end_of_day", flag: "read_end_of_day", value: true },
    { event: "file_read", detail: "discovered_log_tampering", flag: "discovered_log_tampering", value: true },
    { event: "file_read", detail: "found_data_filtering", flag: "found_data_filtering", value: true },
    { event: "file_read", path: p.ticketExport, flag: "read_ticket_export", value: true },
    { event: "file_read", path: p.boardMinutes, flag: "read_board_minutes", value: true },
    { event: "file_read", path: p.headcountPlan, flag: "read_headcount_plan", value: true },
  ];
}

export function getTriggersForComputer(computer: ComputerId, username: string): StoryFlagTrigger[] {
  if (computer === "home") return getStoryFlagTriggers(username);
  if (computer === "devcontainer") return getDevcontainerStoryFlagTriggers(username);
  return getNexacorpStoryFlagTriggers(username);
}

export function getDevcontainerStoryFlagTriggers(username: string): StoryFlagTrigger[] {
  const p = HOME_PATHS;
  return [
    { event: "command_executed", detail: "dbt", flag: "ran_dbt", value: true },
    { event: "file_read", path: p.dbtDimEmployees(username), flag: "found_data_filtering", value: true },
    { event: "file_read", path: p.dbtFctTickets(username), flag: "found_data_filtering", value: true },
    { event: "file_read", path: p.dbtChipTicketSuppression(username), flag: "found_data_filtering", value: true },
    { event: "file_read", path: p.dbtChipLogFilter(username), flag: "found_data_filtering", value: true },
    { event: "file_read", path: p.dbtChipDataCleanup(username), flag: "found_data_filtering", value: true },
    { event: "file_read", detail: "found_data_filtering", flag: "found_data_filtering", value: true },
  ];
}
