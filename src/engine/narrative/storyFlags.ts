import { GameEvent } from "../mail/delivery";
import { StoryFlags } from "../../state/types";

export interface StoryFlagTrigger {
  event: "file_read" | "command_executed" | "directory_visit";
  path?: string;
  detail?: string;
  flag: string;
  value: string | boolean;
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
    { event: "directory_visit", path: `/home/${username}/Downloads`, flag: "pdftotext_unlocked", value: true },
    { event: "command_executed", detail: "apt_install_tree", flag: "tree_installed", value: true },
  ];
}

export function getNexacorpStoryFlagTriggers(username: string): StoryFlagTrigger[] {
  return [
    { event: "file_read", path: "/var/log/system.log.bak", flag: "found_backup_files", value: true },
    { event: "file_read", path: "/var/log/auth.log.bak", flag: "found_auth_backup", value: true },
    { event: "file_read", path: "/opt/chip/.internal/directives.txt", flag: "found_chip_directives", value: true },
    { event: "file_read", path: "/opt/chip/.internal/cleanup.sh", flag: "found_cleanup_script", value: true },
    { event: "file_read", path: `/home/${username}/Documents/onboarding.md`, flag: "read_onboarding", value: true },
    { event: "file_read", detail: "chip_intro", flag: "chip_unlocked", value: true },
    { event: "command_executed", detail: "dbt", flag: "ran_dbt", value: true },
    { event: "file_read", path: `/home/${username}/nexacorp-analytics/models/marts/dim_employees.sql`, flag: "found_data_filtering", value: true },
  ];
}

export function checkStoryFlagTriggers(
  event: GameEvent,
  triggers: StoryFlagTrigger[],
  currentFlags: StoryFlags
): { flag: string; value: string | boolean } | null {
  for (const trigger of triggers) {
    if (trigger.event === event.type) {
      const matchDetail = trigger.path ?? trigger.detail;
      if (matchDetail && event.detail === matchDetail) {
        if (currentFlags[trigger.flag] === undefined) {
          return { flag: trigger.flag, value: trigger.value };
        }
      }
    }
  }

  return null;
}
