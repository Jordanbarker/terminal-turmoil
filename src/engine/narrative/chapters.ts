export type ObjectiveCompletionCheck =
  | { source: "storyFlag"; key: string }
  | { source: "completedObjective"; key: string }
  | { source: "deliveredEmail"; key: string };

export interface ObjectiveDefinition {
  id: string;
  description: string;
  check: ObjectiveCompletionCheck;
  hidden?: boolean;
  prerequisite?: string;
  optional?: boolean;
}

export interface ChapterDefinition {
  id: string;
  title: string;
  objectives: ObjectiveDefinition[];
}

export const CHAPTERS: ChapterDefinition[] = [
  {
    id: "chapter-1",
    title: "New Beginnings",
    objectives: [
      {
        id: "learn_commands",
        description: "Learn basic terminal commands",
        check: { source: "storyFlag", key: "commands_unlocked" },
      },
      {
        id: "explore_home",
        description: "Explore your personal files",
        check: { source: "storyFlag", key: "read_resume" },
        optional: true,
      },
      {
        id: "check_email",
        description: "Check your email",
        check: { source: "deliveredEmail", key: "nexacorp_offer" },
      },
      {
        id: "accept_offer",
        description: "Reply to the job offer",
        check: { source: "completedObjective", key: "accepted_nexacorp" },
      },
    ],
  },
  {
    id: "chapter-2",
    title: "First Day",
    objectives: [
      {
        id: "read_onboarding",
        description: "Read the onboarding docs",
        check: { source: "storyFlag", key: "read_onboarding" },
      },
      {
        id: "explore_jchen",
        description: "Investigate J. Chen's files",
        check: { source: "storyFlag", key: "found_backup_files" },
      },
      {
        id: "run_dbt",
        description: "Run the data pipeline",
        check: { source: "storyFlag", key: "ran_dbt" },
      },
      {
        id: "discover_tampering",
        description: "Discover the log tampering",
        check: { source: "storyFlag", key: "discovered_log_tampering" },
        hidden: true,
        prerequisite: "explore_jchen",
        optional: true,
      },
      {
        id: "find_directives",
        description: "Find Chip's hidden directives",
        check: { source: "storyFlag", key: "found_chip_directives" },
        hidden: true,
        prerequisite: "explore_jchen",
        optional: true,
      },
      {
        id: "find_filtering",
        description: "Discover the data filtering",
        check: { source: "storyFlag", key: "found_data_filtering" },
        hidden: true,
        prerequisite: "run_dbt",
        optional: true,
      },
    ],
  },
];
