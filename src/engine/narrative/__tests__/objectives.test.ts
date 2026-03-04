import { describe, it, expect } from "vitest";
import { resolveObjectives } from "../objectives";
import { ChapterDefinition, ObjectiveCompletionCheck } from "../chapters";
import { StoryFlagName } from "../storyFlags";

const testChapter: ChapterDefinition = {
  id: "test-chapter",
  title: "Test Chapter",
  objectives: [
    {
      id: "flag_obj",
      description: "Story flag objective",
      check: { source: "storyFlag", key: "some_flag" as StoryFlagName } as ObjectiveCompletionCheck,
    },
    {
      id: "completed_obj",
      description: "Completed objective",
      check: { source: "completedObjective", key: "some_objective" },
    },
    {
      id: "email_obj",
      description: "Email objective",
      check: { source: "deliveredEmail", key: "some_email" },
    },
    {
      id: "hidden_obj",
      description: "Hidden objective",
      check: { source: "storyFlag", key: "hidden_flag" as StoryFlagName } as ObjectiveCompletionCheck,
      hidden: true,
      prerequisite: "flag_obj",
    },
  ],
};

describe("resolveObjectives", () => {
  it("marks storyFlag objective as completed when flag is set", () => {
    const result = resolveObjectives(
      testChapter,
      { some_flag: true },
      [],
      []
    );
    expect(result.find((o) => o.id === "flag_obj")?.completed).toBe(true);
  });

  it("marks storyFlag objective as incomplete when flag is not set", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.find((o) => o.id === "flag_obj")?.completed).toBe(false);
  });

  it("marks completedObjective as completed when in list", () => {
    const result = resolveObjectives(
      testChapter,
      {},
      ["some_objective"],
      []
    );
    expect(result.find((o) => o.id === "completed_obj")?.completed).toBe(true);
  });

  it("marks completedObjective as incomplete when not in list", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.find((o) => o.id === "completed_obj")?.completed).toBe(false);
  });

  it("marks deliveredEmail as completed when in list", () => {
    const result = resolveObjectives(
      testChapter,
      {},
      [],
      ["some_email"]
    );
    expect(result.find((o) => o.id === "email_obj")?.completed).toBe(true);
  });

  it("marks deliveredEmail as incomplete when not in list", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.find((o) => o.id === "email_obj")?.completed).toBe(false);
  });

  it("hides hidden objectives when prerequisite is not completed", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.find((o) => o.id === "hidden_obj")?.visible).toBe(false);
  });

  it("reveals hidden objectives when prerequisite is completed", () => {
    const result = resolveObjectives(
      testChapter,
      { some_flag: true },
      [],
      []
    );
    expect(result.find((o) => o.id === "hidden_obj")?.visible).toBe(true);
  });

  it("non-hidden objectives are always visible", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.find((o) => o.id === "flag_obj")?.visible).toBe(true);
    expect(result.find((o) => o.id === "completed_obj")?.visible).toBe(true);
    expect(result.find((o) => o.id === "email_obj")?.visible).toBe(true);
  });

  it("hidden objective can be both visible and completed", () => {
    const result = resolveObjectives(
      testChapter,
      { some_flag: true, hidden_flag: true },
      [],
      []
    );
    const hidden = result.find((o) => o.id === "hidden_obj");
    expect(hidden?.visible).toBe(true);
    expect(hidden?.completed).toBe(true);
  });

  it("marks objective as failed when failCheck is satisfied", () => {
    const chapterWithFail: ChapterDefinition = {
      id: "fail-chapter",
      title: "Fail Chapter",
      objectives: [
        {
          id: "failable_obj",
          description: "Failable objective",
          check: { source: "completedObjective", key: "success" },
          failCheck: { source: "completedObjective", key: "failed" },
        },
      ],
    };
    const result = resolveObjectives(chapterWithFail, {}, ["failed"], []);
    const obj = result.find((o) => o.id === "failable_obj");
    expect(obj?.failed).toBe(true);
    expect(obj?.completed).toBe(false);
  });

  it("does not mark objective as failed when failCheck is not satisfied", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.find((o) => o.id === "flag_obj")?.failed).toBe(false);
  });

  it("returns all objectives in order", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.map((o) => o.id)).toEqual([
      "flag_obj",
      "completed_obj",
      "email_obj",
      "hidden_obj",
    ]);
  });
});
