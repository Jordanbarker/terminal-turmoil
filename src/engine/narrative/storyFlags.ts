import { GameEvent } from "../mail/delivery";
import { StoryFlags } from "../../state/types";

export const STORY_FLAG_NAMES = [
  "read_resume",
  "read_cover_letter",
  "read_diary",
  "read_job_notes",
  "read_glassdoor",
  "research_depth",
  "read_auto_apply",
  "read_bashrc",
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

  "discovered_log_tampering",
  "used_chip_topics",
  "dbt_project_cloned",
] as const;

export type StoryFlagName = (typeof STORY_FLAG_NAMES)[number];

export interface StoryFlagTrigger {
  event: "file_read" | "command_executed" | "directory_visit";
  path?: string;
  detail?: string;
  flag: StoryFlagName;
  value: string | boolean;
  toast?: string;
}

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
    { event: "command_executed", detail: "apt_install_tree", flag: "tree_installed", value: true, toast: "tree command installed!" },
    { event: "file_read", detail: "nexacorp_offer", flag: "read_nexacorp_offer", value: true },
  ];
}

export function getNexacorpStoryFlagTriggers(username: string): StoryFlagTrigger[] {
  return [
    { event: "file_read", path: "/var/log/system.log.bak", flag: "found_backup_files", value: true },
    { event: "file_read", path: "/var/log/auth.log.bak", flag: "found_auth_backup", value: true },
    { event: "file_read", path: "/opt/chip/.internal/directives.txt", flag: "found_chip_directives", value: true },
    { event: "file_read", path: "/opt/chip/.internal/cleanup.sh", flag: "found_cleanup_script", value: true },
    { event: "file_read", path: `/home/${username}/Documents/onboarding.md`, flag: "read_onboarding", value: true },
    { event: "file_read", path: `/home/${username}/Documents/team-info.md`, flag: "read_team_info", value: true },
    { event: "file_read", path: `/srv/engineering/chen-handoff/notes.txt`, flag: "read_handoff_notes", value: true },
    { event: "file_read", detail: "chip_intro", flag: "chip_unlocked", value: true, toast: "chip command unlocked!" },
    { event: "file_read", detail: "discovered_log_tampering", flag: "discovered_log_tampering", value: true },
    { event: "command_executed", detail: "dbt", flag: "ran_dbt", value: true },
    { event: "file_read", path: `/home/${username}/nexacorp-analytics/models/marts/dim_employees.sql`, flag: "found_data_filtering", value: true },
    { event: "file_read", path: `/home/${username}/nexacorp-analytics/models/marts/fct_support_tickets.sql`, flag: "found_data_filtering", value: true },
    { event: "file_read", path: `/home/${username}/nexacorp-analytics/models/_chip_internal/chip_ticket_suppression.sql`, flag: "found_data_filtering", value: true },
    { event: "file_read", path: `/home/${username}/nexacorp-analytics/models/_chip_internal/chip_log_filter.sql`, flag: "found_data_filtering", value: true },
    { event: "file_read", path: `/home/${username}/nexacorp-analytics/models/_chip_internal/chip_data_cleanup.sql`, flag: "found_data_filtering", value: true },
    { event: "file_read", detail: "found_data_filtering", flag: "found_data_filtering", value: true },
  ];
}

export function checkStoryFlagTriggers(
  event: GameEvent,
  triggers: StoryFlagTrigger[],
  currentFlags: StoryFlags
): { flag: StoryFlagName; value: string | boolean; toast?: string } | null {
  for (const trigger of triggers) {
    if (trigger.event === event.type) {
      const matchDetail = trigger.path ?? trigger.detail;
      if (matchDetail && event.detail === matchDetail) {
        if (currentFlags[trigger.flag] === undefined) {
          return { flag: trigger.flag, value: trigger.value, toast: trigger.toast };
        }
      }
    }
  }

  return null;
}
