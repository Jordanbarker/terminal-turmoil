import { ChapterDefinition, ObjectiveDefinition } from "./chapters";
import { StoryFlags } from "../../state/types";

export interface ResolvedObjective {
  id: string;
  description: string;
  completed: boolean;
  visible: boolean;
  optional: boolean;
}

function isCompleted(
  obj: ObjectiveDefinition,
  storyFlags: StoryFlags,
  completedObjectives: string[],
  deliveredEmailIds: string[]
): boolean {
  switch (obj.check.source) {
    case "storyFlag":
      return !!storyFlags[obj.check.key];
    case "completedObjective":
      return completedObjectives.includes(obj.check.key);
    case "deliveredEmail":
      return deliveredEmailIds.includes(obj.check.key);
  }
}

export function resolveObjectives(
  chapter: ChapterDefinition,
  storyFlags: StoryFlags,
  completedObjectives: string[],
  deliveredEmailIds: string[]
): ResolvedObjective[] {
  // First pass: determine completion status
  const completionMap = new Map<string, boolean>();
  for (const obj of chapter.objectives) {
    completionMap.set(
      obj.id,
      isCompleted(obj, storyFlags, completedObjectives, deliveredEmailIds)
    );
  }

  // Second pass: determine visibility
  // Hidden objectives become visible when their prerequisite is completed
  return chapter.objectives.map((obj) => {
    let visible = !obj.hidden;
    if (obj.hidden && obj.prerequisite) {
      visible = !!completionMap.get(obj.prerequisite);
    }
    return {
      id: obj.id,
      description: obj.description,
      completed: !!completionMap.get(obj.id),
      visible,
      optional: !!obj.optional,
    };
  });
}
