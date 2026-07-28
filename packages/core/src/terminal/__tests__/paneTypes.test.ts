import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_NUDGE_RATIO,
  allLeaves,
  collapsePane,
  findLeaf,
  findSplit,
  firstLeaf,
  focusDirectionTarget,
  makeLeaf,
  makeWindow,
  nearestResizableSplit,
  nextLeafId,
  nodeBox,
  nudgeSplitRatio,
  paneRects,
  prunePanesByComputer,
  rebuildWindow,
  resetPaneIdCounters,
  serializeWindow,
  setSplitRatio,
  splitNode,
  windowOfPane,
  type PaneNode,
} from "../paneTypes";

beforeEach(() => resetPaneIdCounters());

function stackedWindow() {
  const win = makeWindow("test", "/home/test");
  const rows = splitNode(win.root, win.activePaneId, "v", () => makeLeaf("test", "/home/test"));
  if (!rows || rows.root.kind !== "split") throw new Error("split failed");
  return { root: rows.root as PaneNode & { kind: "split" }, splitId: rows.root.id };
}

describe("makeWindow", () => {
  it("creates a single-leaf window focused on that leaf", () => {
    const w = makeWindow("alpha", "/home/player");
    expect(w.root.kind).toBe("leaf");
    expect(allLeaves(w.root)).toHaveLength(1);
    expect(w.activePaneId).toBe(firstLeaf(w.root).id);
  });
});

describe("splitNode", () => {
  it("replaces a leaf with a split (original=a, new=b)", () => {
    const w = makeWindow("alpha", "/a");
    const leafId = firstLeaf(w.root).id;
    const res = splitNode(w.root, leafId, "h", () => makeLeaf("alpha", "/a"))!;
    expect(res.root.kind).toBe("split");
    const split = res.root as Extract<PaneNode, { kind: "split" }>;
    expect(split.direction).toBe("h");
    expect(split.ratio).toBe(0.5);
    expect((split.a as { id: string }).id).toBe(leafId);
    expect((split.b as { id: string }).id).toBe(res.newPaneId);
    expect(allLeaves(res.root)).toHaveLength(2);
  });

  it("can nest splits arbitrarily", () => {
    const w = makeWindow("alpha", "/a");
    const first = firstLeaf(w.root).id;
    const r1 = splitNode(w.root, first, "h", () => makeLeaf("alpha", "/a"))!;
    const r2 = splitNode(r1.root, r1.newPaneId, "v", () => makeLeaf("alpha", "/a"))!;
    expect(allLeaves(r2.root)).toHaveLength(3);
  });

  it("returns null for an unknown pane", () => {
    const w = makeWindow("alpha", "/a");
    expect(splitNode(w.root, "nope", "h", () => makeLeaf("alpha", "/a"))).toBeNull();
  });
});

describe("collapsePane", () => {
  it("promotes the sibling when one of two panes closes", () => {
    const w = makeWindow("alpha", "/a");
    const first = firstLeaf(w.root).id;
    const split = splitNode(w.root, first, "h", () => makeLeaf("beta", "/b"))!;
    const collapsed = collapsePane(split.root, first);
    expect(collapsed).not.toBeNull();
    expect(collapsed!.kind).toBe("leaf");
    expect((collapsed as { id: string }).id).toBe(split.newPaneId);
  });

  it("returns null when the only pane is closed", () => {
    const w = makeWindow("alpha", "/a");
    expect(collapsePane(w.root, firstLeaf(w.root).id)).toBeNull();
  });

  it("keeps the rest of the tree when a nested pane closes", () => {
    const w = makeWindow("alpha", "/a");
    const first = firstLeaf(w.root).id;
    const r1 = splitNode(w.root, first, "h", () => makeLeaf("alpha", "/b"))!;
    const r2 = splitNode(r1.root, r1.newPaneId, "v", () => makeLeaf("alpha", "/c"))!;
    const collapsed = collapsePane(r2.root, r2.newPaneId)!;
    expect(allLeaves(collapsed)).toHaveLength(2);
  });
});

describe("prunePanesByComputer", () => {
  it("removes panes on downed computers, collapsing splits", () => {
    const w = makeWindow("alpha", "/a");
    const first = firstLeaf(w.root).id;
    const split = splitNode(w.root, first, "h", () => makeLeaf("beta", "/b"))!;
    const pruned = prunePanesByComputer(split.root, new Set(["beta"]));
    expect(pruned).not.toBeNull();
    expect(allLeaves(pruned!).every((l) => l.computerId === "alpha")).toBe(true);
  });

  it("never removes the protected pane even if its computer is down", () => {
    const w = makeWindow("beta", "/a");
    const protectedId = firstLeaf(w.root).id;
    const split = splitNode(w.root, protectedId, "h", () => makeLeaf("beta", "/b"))!;
    const pruned = prunePanesByComputer(split.root, new Set(["beta"]), protectedId);
    expect(pruned).not.toBeNull();
    expect(allLeaves(pruned!)).toHaveLength(1);
    expect(allLeaves(pruned!)[0].id).toBe(protectedId);
  });

  it("returns null when all panes are downed and none protected", () => {
    const w = makeWindow("beta", "/a");
    const split = splitNode(w.root, firstLeaf(w.root).id, "h", () => makeLeaf("gamma", "/b"))!;
    const pruned = prunePanesByComputer(split.root, new Set(["beta", "gamma"]));
    expect(pruned).toBeNull();
  });
});

describe("setSplitRatio", () => {
  it("clamps the ratio to [MIN, 1-MIN]", () => {
    const w = makeWindow("alpha", "/a");
    const split = splitNode(w.root, firstLeaf(w.root).id, "h", () => makeLeaf("alpha", "/b"))!;
    const splitId = (split.root as Extract<PaneNode, { kind: "split" }>).id;
    const tiny = setSplitRatio(split.root, splitId, 0.0001) as Extract<PaneNode, { kind: "split" }>;
    expect(tiny.ratio).toBeGreaterThan(0);
    expect(tiny.ratio).toBeLessThan(0.5);
    const huge = setSplitRatio(split.root, splitId, 5) as Extract<PaneNode, { kind: "split" }>;
    expect(huge.ratio).toBeLessThan(1);
  });

  it("preserves identity when the ratio is unchanged", () => {
    const w = makeWindow("alpha", "/a");
    const split = splitNode(w.root, firstLeaf(w.root).id, "h", () => makeLeaf("alpha", "/b"))!;
    const splitId = (split.root as Extract<PaneNode, { kind: "split" }>).id;
    expect(setSplitRatio(split.root, splitId, 0.5)).toBe(split.root);
    expect(setSplitRatio(split.root, "nope", 0.7)).toBe(split.root);
  });

  it("rebuilds only the path to the target split", () => {
    const w = makeWindow("alpha", "/a");
    const first = firstLeaf(w.root).id;
    const r1 = splitNode(w.root, first, "h", () => makeLeaf("alpha", "/b"))!;
    const r2 = splitNode(r1.root, r1.newPaneId, "v", () => makeLeaf("alpha", "/c"))!;
    const outer = r2.root as Extract<PaneNode, { kind: "split" }>;
    const inner = outer.b as Extract<PaneNode, { kind: "split" }>;
    const updated = setSplitRatio(r2.root, inner.id, 0.7) as Extract<PaneNode, { kind: "split" }>;
    expect(updated).not.toBe(outer);
    expect(updated.a).toBe(outer.a); // untouched sibling subtree keeps identity
    expect((updated.b as Extract<PaneNode, { kind: "split" }>).ratio).toBeCloseTo(0.7);
  });
});


describe("nearestResizableSplit", () => {
  it("returns the matching-orientation ancestor split", () => {
    const w = makeWindow("alpha", "/a");
    const left = firstLeaf(w.root).id;
    const split = splitNode(w.root, left, "h", () => makeLeaf("alpha", "/b"))!;
    const splitId = (split.root as Extract<PaneNode, { kind: "split" }>).id;
    expect(nearestResizableSplit(split.root, left, "h")).toBe(splitId);
  });

  it("walks past the wrong-orientation parent to a matching grandparent", () => {
    const w = makeWindow("alpha", "/a");
    const first = firstLeaf(w.root).id;
    // outer h-split; then split the new (right) pane vertically
    const r1 = splitNode(w.root, first, "h", () => makeLeaf("alpha", "/b"))!;
    const r2 = splitNode(r1.root, r1.newPaneId, "v", () => makeLeaf("alpha", "/c"))!;
    const outerH = (r2.root as Extract<PaneNode, { kind: "split" }>).id;
    // from a pane inside the v-split, an L/R resize must skip the v-split up to the h-split
    expect(nearestResizableSplit(r2.root, r2.newPaneId, "h")).toBe(outerH);
  });

  it("returns undefined when no ancestor matches the orientation", () => {
    const w = makeWindow("alpha", "/a");
    const first = firstLeaf(w.root).id;
    const split = splitNode(w.root, first, "h", () => makeLeaf("alpha", "/b"))!;
    expect(nearestResizableSplit(split.root, first, "v")).toBeUndefined();
  });
});

describe("nodeBox", () => {
  it("returns the fractional box of a split node", () => {
    const w = makeWindow("alpha", "/a");
    const split = splitNode(w.root, firstLeaf(w.root).id, "h", () => makeLeaf("alpha", "/b"))!;
    const splitId = (split.root as Extract<PaneNode, { kind: "split" }>).id;
    expect(nodeBox(split.root, splitId)).toEqual({ id: splitId, x: 0, y: 0, w: 1, h: 1 });
  });

  it("returns the sub-box of a nested leaf and undefined for unknown ids", () => {
    const w = makeWindow("alpha", "/a");
    const first = firstLeaf(w.root).id;
    const split = splitNode(w.root, first, "h", () => makeLeaf("alpha", "/b"))!;
    const box = nodeBox(split.root, split.newPaneId)!;
    expect(box.x).toBeCloseTo(0.5);
    expect(box.w).toBeCloseTo(0.5);
    expect(nodeBox(split.root, "nope")).toBeUndefined();
  });
});

describe("paneRects", () => {
  it("splits a unit box horizontally by ratio", () => {
    const w = makeWindow("alpha", "/a");
    const split = splitNode(w.root, firstLeaf(w.root).id, "h", () => makeLeaf("alpha", "/b"))!;
    const rects = paneRects(split.root);
    expect(rects).toHaveLength(2);
    expect(rects[0].w).toBeCloseTo(0.5);
    expect(rects[1].x).toBeCloseTo(0.5);
  });
});

describe("focusDirectionTarget", () => {
  it("moves right to the adjacent pane", () => {
    const w = makeWindow("alpha", "/a");
    const left = firstLeaf(w.root).id;
    const split = splitNode(w.root, left, "h", () => makeLeaf("alpha", "/b"))!;
    expect(focusDirectionTarget(split.root, left, "R")).toBe(split.newPaneId);
    expect(focusDirectionTarget(split.root, split.newPaneId, "L")).toBe(left);
  });

  it("returns undefined when there's no pane in that direction", () => {
    const w = makeWindow("alpha", "/a");
    const left = firstLeaf(w.root).id;
    const split = splitNode(w.root, left, "h", () => makeLeaf("alpha", "/b"))!;
    expect(focusDirectionTarget(split.root, left, "U")).toBeUndefined();
  });
});

describe("nextLeafId", () => {
  it("cycles through leaves in order, wrapping", () => {
    const w = makeWindow("alpha", "/a");
    const first = firstLeaf(w.root).id;
    const split = splitNode(w.root, first, "h", () => makeLeaf("alpha", "/b"))!;
    expect(nextLeafId(split.root, first)).toBe(split.newPaneId);
    expect(nextLeafId(split.root, split.newPaneId)).toBe(first);
  });
});

describe("findLeaf / findSplit", () => {
  it("locate nodes by id", () => {
    const w = makeWindow("alpha", "/a");
    const first = firstLeaf(w.root).id;
    const split = splitNode(w.root, first, "v", () => makeLeaf("alpha", "/b"))!;
    expect(findLeaf(split.root, first)?.id).toBe(first);
    expect(findLeaf(split.root, "nope")).toBeUndefined();
    const splitId = (split.root as Extract<PaneNode, { kind: "split" }>).id;
    expect(findSplit(split.root, splitId)?.id).toBe(splitId);
  });
});

describe("windowOfPane", () => {
  it("finds the window owning a pane, at any depth", () => {
    const a = makeWindow("alpha", "/a");
    const b = makeWindow("alpha", "/b");
    const bFirst = firstLeaf(b.root).id;
    const split = splitNode(b.root, bFirst, "h", () => makeLeaf("alpha", "/c"))!;
    const bSplit = { ...b, root: split.root };
    const windows = [a, bSplit];

    expect(windowOfPane(windows, firstLeaf(a.root).id)?.id).toBe(a.id);
    expect(windowOfPane(windows, split.newPaneId)?.id).toBe(b.id);
    expect(windowOfPane(windows, "nope")).toBeUndefined();
    expect(windowOfPane([], firstLeaf(a.root).id)).toBeUndefined();
  });
});

describe("serializeWindow / rebuildWindow", () => {
  it("preserves a custom window name across save/rebuild (ids regenerate)", () => {
    const w = { ...makeWindow("alpha", "/a"), name: "deploy" };
    const saved = serializeWindow(w);
    expect(saved.name).toBe("deploy");
    const rebuilt = rebuildWindow(saved);
    expect(rebuilt.name).toBe("deploy");
    expect(rebuilt.id).not.toBe(w.id); // fresh id
  });

  it("omits name when the window has none", () => {
    const saved = serializeWindow(makeWindow("alpha", "/a"));
    expect(saved.name).toBeUndefined();
    expect(rebuildWindow(saved).name).toBeUndefined();
  });
});

describe("nudgeSplitRatio", () => {
  it("caps a single nudge at MAX_NUDGE_RATIO in either direction", () => {
    const { root, splitId } = stackedWindow();
    const grown = nudgeSplitRatio(root, splitId, 0.2);
    const shrunk = nudgeSplitRatio(root, splitId, -0.2);
    if (grown.kind !== "split" || shrunk.kind !== "split") throw new Error("expected splits");
    expect(grown.ratio).toBeCloseTo(0.5 + MAX_NUDGE_RATIO);
    expect(shrunk.ratio).toBeCloseTo(0.5 - MAX_NUDGE_RATIO);
  });

  it("reaches any ±MAX_NUDGE_RATIO band by repeated nudges even when the raw delta is huge", () => {
    // A short pane can ask for a ~0.16 step; the cap must guarantee some
    // stopping point lands within ±MAX_NUDGE_RATIO of a 0.7 target.
    const { root, splitId } = stackedWindow();
    let node: PaneNode = root;
    let landed = false;
    for (let i = 0; i < 20 && !landed; i++) {
      node = nudgeSplitRatio(node, splitId, 0.16);
      if (node.kind !== "split") throw new Error("expected a split");
      landed = Math.abs(node.ratio - 0.7) <= MAX_NUDGE_RATIO + 1e-9;
    }
    expect(landed).toBe(true);
  });
  it("adds a delta to the split's ratio, capped per nudge at MAX_NUDGE_RATIO", () => {
    const w = makeWindow("alpha", "/a");
    const split = splitNode(w.root, firstLeaf(w.root).id, "h", () => makeLeaf("alpha", "/b"))!;
    const splitId = (split.root as Extract<PaneNode, { kind: "split" }>).id;
    const bigger = nudgeSplitRatio(split.root, splitId, 0.03) as Extract<PaneNode, { kind: "split" }>;
    expect(bigger.ratio).toBeCloseTo(0.53);
    const capped = nudgeSplitRatio(split.root, splitId, 1) as Extract<PaneNode, { kind: "split" }>;
    expect(capped.ratio).toBeCloseTo(0.5 + MAX_NUDGE_RATIO);
  });

  it("leaves the tree unchanged for an unknown / non-split id", () => {
    const w = makeWindow("alpha", "/a");
    expect(nudgeSplitRatio(w.root, "nope", 0.2)).toBe(w.root);
    expect(nudgeSplitRatio(w.root, firstLeaf(w.root).id, 0.2)).toBe(w.root);
  });
});
