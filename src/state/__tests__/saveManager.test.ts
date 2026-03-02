import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createSaveData,
  saveToSlot,
  loadFromSlot,
  deleteSlot,
  listSaveSlots,
  restoreFS,
  migrateSaveData,
  SaveableState,
} from "../saveManager";
import { SaveData, SAVE_FORMAT_VERSION } from "../saveTypes";
import { VirtualFS } from "../../engine/filesystem/VirtualFS";
import { DirectoryNode } from "../../engine/filesystem/types";

function createMinimalFS(): VirtualFS {
  const root: DirectoryNode = {
    type: "directory",
    name: "/",
    permissions: "rwxr-xr-x",
    hidden: false,
    children: {
      home: {
        type: "directory",
        name: "home",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          player: {
            type: "directory",
            name: "player",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {
              "test.txt": {
                type: "file",
                name: "test.txt",
                content: "test content",
                permissions: "rw-r--r--",
                hidden: false,
              },
            },
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/player", "/home/player");
}

function createState(): SaveableState {
  return {
    fs: createMinimalFS(),
    cwd: "/home/player",
    username: "player",
    gamePhase: "playing",
    currentChapter: "chapter-1",
    completedObjectives: ["obj-1"],
    deliveredEmailIds: ["email-1"],
    commandHistory: ["ls", "cd docs", "cat readme.md"],
    activeComputer: "nexacorp",
    storyFlags: {},
  };
}

// Mock localStorage
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  removeItem: vi.fn((key: string) => storage.delete(key)),
};
vi.stubGlobal("localStorage", localStorageMock);

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
});

describe("createSaveData", () => {
  it("creates save data with correct fields", () => {
    const state = createState();
    const data = createSaveData(state, "Test Save");

    expect(data.version).toBe(SAVE_FORMAT_VERSION);
    expect(data.label).toBe("Test Save");
    expect(data.username).toBe("player");
    expect(data.gamePhase).toBe("playing");
    expect(data.currentChapter).toBe("chapter-1");
    expect(data.completedObjectives).toEqual(["obj-1"]);
    expect(data.deliveredEmailIds).toEqual(["email-1"]);
    expect(data.commandHistory).toEqual(["ls", "cd docs", "cat readme.md"]);
    expect(data.cwd).toBe("/home/player");
    expect(data.timestamp).toBeGreaterThan(0);
  });

  it("clones arrays (does not share references)", () => {
    const state = createState();
    const data = createSaveData(state, "Test");
    state.completedObjectives.push("obj-2");
    expect(data.completedObjectives).toEqual(["obj-1"]);
  });

  it("truncates command history to 500 entries", () => {
    const state = createState();
    state.commandHistory = Array.from({ length: 600 }, (_, i) => `cmd-${i}`);
    const data = createSaveData(state, "Test");
    expect(data.commandHistory).toHaveLength(500);
    expect(data.commandHistory[0]).toBe("cmd-100");
  });

  it("serializes filesystem", () => {
    const state = createState();
    const data = createSaveData(state, "Test");
    expect(data.fs.root).toBeDefined();
    expect(data.fs.cwd).toBe("/home/player");
    expect(data.fs.homeDir).toBe("/home/player");
  });
});

describe("saveToSlot / loadFromSlot", () => {
  it("round-trips save data", () => {
    const state = createState();
    const data = createSaveData(state, "Round Trip");

    const saved = saveToSlot("slot-1", data);
    expect(saved).toBe(true);

    const loaded = loadFromSlot("slot-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.label).toBe("Round Trip");
    expect(loaded!.username).toBe("player");
    expect(loaded!.completedObjectives).toEqual(["obj-1"]);
  });

  it("returns null for empty slot", () => {
    expect(loadFromSlot("slot-2")).toBeNull();
  });

  it("returns false when localStorage throws", () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error("QuotaExceeded");
    });
    const data = createSaveData(createState(), "Test");
    expect(saveToSlot("slot-1", data)).toBe(false);
  });
});

describe("deleteSlot", () => {
  it("removes the slot from storage", () => {
    const data = createSaveData(createState(), "Test");
    saveToSlot("slot-1", data);
    deleteSlot("slot-1");
    expect(loadFromSlot("slot-1")).toBeNull();
  });
});

describe("listSaveSlots", () => {
  it("returns all 4 slots", () => {
    const slots = listSaveSlots();
    expect(slots).toHaveLength(4);
    expect(slots.map((s) => s.slotId)).toEqual([
      "auto",
      "slot-1",
      "slot-2",
      "slot-3",
    ]);
  });

  it("marks empty slots correctly", () => {
    const slots = listSaveSlots();
    expect(slots.every((s) => s.empty)).toBe(true);
  });

  it("shows metadata for populated slots", () => {
    const data = createSaveData(createState(), "My Save");
    saveToSlot("slot-1", data);

    const slots = listSaveSlots();
    const slot1 = slots.find((s) => s.slotId === "slot-1")!;
    expect(slot1.empty).toBe(false);
    expect(slot1.label).toBe("My Save");
    expect(slot1.username).toBe("player");
  });
});

describe("restoreFS", () => {
  it("restores VirtualFS from save data", () => {
    const state = createState();
    const data = createSaveData(state, "Test");
    const restoredFs = restoreFS(data);

    expect(restoredFs).toBeInstanceOf(VirtualFS);
    expect(restoredFs.cwd).toBe("/home/player");
    expect(restoredFs.readFile("/home/player/test.txt").content).toBe(
      "test content"
    );
  });
});

describe("migrateSaveData", () => {
  it("returns data unchanged for current version", () => {
    const data = createSaveData(createState(), "Test");
    expect(migrateSaveData(data)).toBe(data);
  });
});
