import { describe, it, expect } from "vitest";
import { STORY_FLAG_NAMES, getStoryFlagTriggers, getNexacorpStoryFlagTriggers, getDevcontainerStoryFlagTriggers } from "../storyFlags";
import { HOME_EMAIL_IDS, getHomeEmailDefinitions } from "../emails/home";
import { NEXACORP_EMAIL_IDS, getNexacorpEmailDefinitions } from "../emails/nexacorp";
import { PIPER_DELIVERY_IDS, getPiperDeliveries } from "../piper/messages";
import { CHAPTERS } from "../chapters";

const TEST_USERNAME = "ren";
const ALL_FLAG_NAMES = new Set(STORY_FLAG_NAMES);
const ALL_HOME_EMAIL_IDS = new Set(HOME_EMAIL_IDS);
const ALL_NEXACORP_EMAIL_IDS = new Set(NEXACORP_EMAIL_IDS);
const ALL_PIPER_DELIVERY_IDS = new Set(PIPER_DELIVERY_IDS);

// Collect all email IDs for cross-reference lookups
const allEmailIds = new Set([...HOME_EMAIL_IDS, ...NEXACORP_EMAIL_IDS]);

// Collect all piper delivery IDs from actual data
const allPiperDeliveries = getPiperDeliveries(TEST_USERNAME);
const allPiperDeliveryIds = new Set(allPiperDeliveries.map((d) => d.id));

// All story flag triggers
const homeTriggers = getStoryFlagTriggers(TEST_USERNAME);
const nexacorpTriggers = getNexacorpStoryFlagTriggers(TEST_USERNAME);
const devcontainerTriggers = getDevcontainerStoryFlagTriggers(TEST_USERNAME);
const allTriggers = [...homeTriggers, ...nexacorpTriggers, ...devcontainerTriggers];

describe("Story Integrity", () => {
  describe("1. Story flag triggers use valid flag names", () => {
    it("home triggers all reference valid story flag names", () => {
      for (const trigger of homeTriggers) {
        expect(ALL_FLAG_NAMES.has(trigger.flag), `Home trigger flag '${trigger.flag}' not in STORY_FLAG_NAMES`).toBe(true);
      }
    });

    it("nexacorp triggers all reference valid story flag names", () => {
      for (const trigger of nexacorpTriggers) {
        expect(ALL_FLAG_NAMES.has(trigger.flag), `NexaCorp trigger flag '${trigger.flag}' not in STORY_FLAG_NAMES`).toBe(true);
      }
    });

    it("devcontainer triggers all reference valid story flag names", () => {
      for (const trigger of devcontainerTriggers) {
        expect(ALL_FLAG_NAMES.has(trigger.flag), `Devcontainer trigger flag '${trigger.flag}' not in STORY_FLAG_NAMES`).toBe(true);
      }
    });
  });

  describe("2. Email requireDelivered references exist", () => {
    it("home email requireDelivered IDs exist", () => {
      const homeDefs = getHomeEmailDefinitions(TEST_USERNAME);
      for (const def of homeDefs) {
        const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
        for (const trigger of triggers) {
          if (trigger.type === "after_file_read" && trigger.requireDelivered) {
            expect(
              allEmailIds.has(trigger.requireDelivered as (typeof HOME_EMAIL_IDS)[number]),
              `Home email requireDelivered '${trigger.requireDelivered}' not found in email definitions`
            ).toBe(true);
          }
        }
      }
    });

    it("nexacorp email requireDelivered IDs exist", () => {
      const nexaDefs = getNexacorpEmailDefinitions(TEST_USERNAME);
      for (const def of nexaDefs) {
        const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
        for (const trigger of triggers) {
          if (trigger.type === "after_file_read" && trigger.requireDelivered) {
            expect(
              allEmailIds.has(trigger.requireDelivered as (typeof NEXACORP_EMAIL_IDS)[number]),
              `NexaCorp email requireDelivered '${trigger.requireDelivered}' not found in email definitions`
            ).toBe(true);
          }
        }
      }
    });
  });

  describe("3. Piper after_piper_reply deliveryIds exist", () => {
    it("all after_piper_reply triggers reference valid delivery IDs", () => {
      for (const def of allPiperDeliveries) {
        const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
        for (const trigger of triggers) {
          if (trigger.type === "after_piper_reply") {
            expect(
              allPiperDeliveryIds.has(trigger.deliveryId),
              `Piper delivery '${def.id}' references unknown deliveryId '${trigger.deliveryId}'`
            ).toBe(true);
          }
        }
      }
    });
  });

  describe("4. Chapter objective check.key references valid story flag names", () => {
    it("all storyFlag check keys are valid", () => {
      for (const chapter of CHAPTERS) {
        for (const objective of chapter.objectives) {
          if (objective.check.source === "storyFlag") {
            expect(
              ALL_FLAG_NAMES.has(objective.check.key as (typeof STORY_FLAG_NAMES)[number]),
              `Objective '${objective.id}' check.key '${objective.check.key}' not in STORY_FLAG_NAMES`
            ).toBe(true);
          }
        }
      }
    });
  });

  describe("5. Chapter objective visibleWhen.key references valid story flag names", () => {
    it("all storyFlag visibleWhen keys are valid", () => {
      for (const chapter of CHAPTERS) {
        for (const objective of chapter.objectives) {
          if (objective.visibleWhen && objective.visibleWhen.source === "storyFlag") {
            expect(
              ALL_FLAG_NAMES.has(objective.visibleWhen.key as (typeof STORY_FLAG_NAMES)[number]),
              `Objective '${objective.id}' visibleWhen.key '${objective.visibleWhen.key}' not in STORY_FLAG_NAMES`
            ).toBe(true);
          }
        }
      }
    });
  });

  describe("6. PIPER_DELIVERY_IDS matches actual deliveries", () => {
    it("all IDs in PIPER_DELIVERY_IDS exist in actual piper deliveries", () => {
      for (const id of PIPER_DELIVERY_IDS) {
        expect(
          allPiperDeliveryIds.has(id),
          `PIPER_DELIVERY_IDS contains '${id}' which doesn't exist in getPiperDeliveries()`
        ).toBe(true);
      }
    });

    it("all actual piper delivery IDs are in PIPER_DELIVERY_IDS", () => {
      for (const id of allPiperDeliveryIds) {
        expect(
          ALL_PIPER_DELIVERY_IDS.has(id as (typeof PIPER_DELIVERY_IDS)[number]),
          `Piper delivery '${id}' exists in getPiperDeliveries() but not in PIPER_DELIVERY_IDS`
        ).toBe(true);
      }
    });
  });

  describe("7. HOME_EMAIL_IDS matches actual home email definitions", () => {
    it("all IDs in HOME_EMAIL_IDS exist in actual definitions", () => {
      const homeEmailDefs = getHomeEmailDefinitions(TEST_USERNAME);
      const actualIds = new Set(homeEmailDefs.map((d) => d.email.id));
      for (const id of HOME_EMAIL_IDS) {
        expect(actualIds.has(id), `HOME_EMAIL_IDS contains '${id}' not in getHomeEmailDefinitions()`).toBe(true);
      }
    });
  });

  describe("8. Objective group references are valid", () => {
    it("all group references point to valid objective IDs within the same chapter", () => {
      for (const chapter of CHAPTERS) {
        const objectiveIds = new Set(chapter.objectives.map((o) => o.id));
        for (const objective of chapter.objectives) {
          if (objective.group) {
            expect(
              objectiveIds.has(objective.group),
              `Objective '${objective.id}' in '${chapter.id}' references group '${objective.group}' which doesn't exist in the same chapter`
            ).toBe(true);
          }
        }
      }
    });

    it("no nested groups — grouped objectives cannot themselves be group parents", () => {
      for (const chapter of CHAPTERS) {
        const parentIds = new Set(
          chapter.objectives.filter((o) => o.group).map((o) => o.group!)
        );
        for (const objective of chapter.objectives) {
          if (objective.group) {
            expect(
              parentIds.has(objective.id),
              `Objective '${objective.id}' in '${chapter.id}' is both a child (group: '${objective.group}') and a parent`
            ).toBe(false);
          }
        }
      }
    });
  });

  describe("9. NEXACORP_EMAIL_IDS matches actual nexacorp email definitions", () => {
    it("all IDs in NEXACORP_EMAIL_IDS exist in actual definitions", () => {
      const nexaEmailDefs = getNexacorpEmailDefinitions(TEST_USERNAME);
      const actualIds = new Set(nexaEmailDefs.map((d) => d.email.id));
      for (const id of NEXACORP_EMAIL_IDS) {
        expect(actualIds.has(id), `NEXACORP_EMAIL_IDS contains '${id}' not in getNexacorpEmailDefinitions()`).toBe(true);
      }
    });
  });
});
