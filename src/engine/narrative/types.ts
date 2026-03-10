import { StoryFlagName } from "./storyFlags";

export type ObjectiveCompletionCheck =
  | { source: "storyFlag"; key: StoryFlagName }
  | { source: "completedObjective"; key: string }
  | { source: "deliveredEmail"; key: string };

export interface ObjectiveDefinition {
  id: string;
  description: string;
  check: ObjectiveCompletionCheck;
  failCheck?: ObjectiveCompletionCheck;
  hidden?: boolean;
  prerequisite?: string;
  visibleWhen?: ObjectiveCompletionCheck;
  optional?: boolean;
}

export interface ChapterDefinition {
  id: string;
  title: string;
  objectives: ObjectiveDefinition[];
}
