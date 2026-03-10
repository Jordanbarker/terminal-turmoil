import { StoryFlagTrigger } from "../engine/narrative/storyFlags";

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

  "discovered_log_tampering",
  "found_inflated_metrics",
  "used_chip_topics",
  "dbt_project_cloned",
] as const;

export type StoryFlagName = (typeof STORY_FLAG_NAMES)[number];

export function getStoryFlagTriggers(username: string): StoryFlagTrigger[] {
  return [
    { event: "file_read", path: `/home/${username}/Downloads/resume_final_v3.pdf`, flag: "read_resume", value: true },
    { event: "file_read", path: `/home/${username}/Documents/cover_letter_nexacorp.txt`, flag: "read_cover_letter", value: true },
    { event: "file_read", path: `/home/${username}/.private/diary.txt`, flag: "read_diary", value: true },
    { event: "file_read", path: `/home/${username}/Desktop/job_search_notes.txt`, flag: "read_job_notes", value: true },
    { event: "file_read", path: `/home/${username}/scripts/data/glassdoor_reviews.json`, flag: "read_glassdoor", value: true },
    { event: "file_read", path: `/home/${username}/scripts/data/glassdoor_reviews.json`, flag: "research_depth", value: "deep" },
    { event: "file_read", path: `/home/${username}/scripts/auto_apply.py`, flag: "read_auto_apply", value: true },
    { event: "file_read", path: `/home/${username}/.bashrc`, flag: "read_bashrc", value: true },
    { event: "directory_visit", path: `/home/${username}/Downloads`, flag: "pdftotext_unlocked", value: true, toast: "pdftotext command unlocked!" },
    { event: "file_read", path: `/home/${username}/Downloads/resume_final_v3.pdf`, flag: "pdftotext_unlocked", value: true, toast: "pdftotext command unlocked!" },
    { event: "file_read", path: `/home/${username}/Downloads/NexaCorp_AI_Engineer_JD.pdf`, flag: "pdftotext_unlocked", value: true, toast: "pdftotext command unlocked!" },
    { event: "command_executed", detail: "apt_install_tree", flag: "tree_installed", value: true, toast: "tree command installed!" },
    { event: "file_read", detail: "nexacorp_offer", flag: "read_nexacorp_offer", value: true },
    { event: "file_read", detail: "chip_ssh_setup", flag: "ssh_unlocked", value: true, toast: "ssh command unlocked!" },
    { event: "file_read", detail: "olive_tree_tip", flag: "apt_unlocked", value: true, toast: "sudo and apt commands unlocked!" },
    { event: "file_read", detail: "cron_backup_failure", flag: "read_cron_backup", value: true },
    { event: "file_read", detail: "fixed_backup_script", flag: "fixed_backup_script", value: true },
    { event: "command_executed", detail: "ran_auto_apply", flag: "ran_auto_apply", value: true },
  ];
}

export function getNexacorpStoryFlagTriggers(username: string): StoryFlagTrigger[] {
  return [
    { event: "file_read", path: "/var/log/system.log", flag: "oscar_searched_logs", value: true },
    { event: "file_read", path: "/var/log/system.log.bak", flag: "oscar_checked_backups", value: true },
    { event: "command_executed", detail: "diff", flag: "oscar_diffed_logs", value: true },
    { event: "command_executed", detail: "head", flag: "auri_used_head", value: true },
    { event: "command_executed", detail: "tail", flag: "auri_used_tail", value: true },
    { event: "command_executed", detail: "wc", flag: "auri_used_wc", value: true },
    { event: "file_read", path: "/var/log/system.log.bak", flag: "found_backup_files", value: true },
    { event: "file_read", path: "/var/log/auth.log.bak", flag: "found_auth_backup", value: true },
    { event: "file_read", path: "/opt/chip/.internal/directives.txt", flag: "found_chip_directives", value: true },
    { event: "file_read", path: "/opt/chip/.internal/cleanup.sh", flag: "found_cleanup_script", value: true },
    { event: "file_read", path: `/srv/engineering/onboarding.md`, flag: "read_onboarding", value: true },
    { event: "file_read", path: `/srv/engineering/onboarding.md`, flag: "coder_unlocked", value: true, toast: "coder command unlocked! Try: coder ssh ai" },
    { event: "file_read", path: `/srv/engineering/team-info.md`, flag: "read_team_info", value: true },
    { event: "file_read", path: `/srv/engineering/chen-handoff/notes.txt`, flag: "read_handoff_notes", value: true },
    { event: "file_read", detail: "chip_intro", flag: "chip_unlocked", value: true, toast: "chip command unlocked!" },
    { event: "file_read", detail: "welcome_edward", flag: "piper_unlocked", value: true, toast: "piper command unlocked!" },
    { event: "file_read", detail: "discovered_log_tampering", flag: "discovered_log_tampering", value: true },
    { event: "file_read", detail: "found_data_filtering", flag: "found_data_filtering", value: true },
  ];
}

export function getDevcontainerStoryFlagTriggers(username: string): StoryFlagTrigger[] {
  return [
    { event: "command_executed", detail: "dbt", flag: "ran_dbt", value: true },
    { event: "file_read", path: `/home/${username}/nexacorp-analytics/models/marts/dim_employees.sql`, flag: "found_data_filtering", value: true },
    { event: "file_read", path: `/home/${username}/nexacorp-analytics/models/marts/fct_support_tickets.sql`, flag: "found_data_filtering", value: true },
    { event: "file_read", path: `/home/${username}/nexacorp-analytics/models/_chip_internal/chip_ticket_suppression.sql`, flag: "found_data_filtering", value: true },
    { event: "file_read", path: `/home/${username}/nexacorp-analytics/models/_chip_internal/chip_log_filter.sql`, flag: "found_data_filtering", value: true },
    { event: "file_read", path: `/home/${username}/nexacorp-analytics/models/_chip_internal/chip_data_cleanup.sql`, flag: "found_data_filtering", value: true },
    { event: "file_read", detail: "found_data_filtering", flag: "found_data_filtering", value: true },
  ];
}
