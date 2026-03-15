"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "../../state/gameStore";
import { CHAPTERS } from "../../engine/narrative/chapters";
import {
  resolveObjectives,
  ResolvedObjective,
} from "../../engine/narrative/objectives";

function ObjectiveItem({ obj }: { obj: ResolvedObjective }) {
  return (
    <li
      className={
        obj.completed
          ? "text-[#3fb950] line-through opacity-50"
          : obj.failed
            ? "text-red-500"
            : "text-[#c9d1d9]"
      }
    >
      {obj.completed ? "[x]" : obj.failed ? "[!]" : "[ ]"} {obj.description}
    </li>
  );
}

interface GroupNode {
  parent: ResolvedObjective;
  children: ResolvedObjective[];
}

function ObjectiveGroup({ group }: { group: GroupNode }) {
  return (
    <>
      <ObjectiveItem obj={group.parent} />
      {!group.parent.completed &&
        group.children.map((child) => (
          <li key={child.id} className="pl-4">
            <ObjectiveItem obj={child} />
          </li>
        ))}
    </>
  );
}

export default function ObjectiveTracker() {
  const [collapsed, setCollapsed] = useState(false);
  const currentChapter = useGameStore((s) => s.currentChapter);
  const storyFlags = useGameStore((s) => s.storyFlags);
  const completedObjectives = useGameStore((s) => s.completedObjectives);
  const deliveredEmailIds = useGameStore((s) => s.deliveredEmailIds);

  const chapter = CHAPTERS.find((c) => c.id === currentChapter);
  if (!chapter) return null;

  const objectives = resolveObjectives(
    chapter,
    storyFlags,
    completedObjectives,
    deliveredEmailIds
  );

  // Auto-sync objectives that resolved as completed (via story flags, etc.)
  // into the completedObjectives store so downstream visibleWhen: completedObjective works.
  useEffect(() => {
    const newlyCompleted = objectives.filter(
      (o) => o.completed && !completedObjectives.includes(o.id)
    );
    if (newlyCompleted.length > 0) {
      const store = useGameStore.getState();
      for (const obj of newlyCompleted) {
        store.completeObjective(obj.id);
      }
    }
  }, [objectives, completedObjectives]);

  const visible = objectives.filter((o) => o.visible);
  const done = visible.filter((o) => o.completed).length;

  // Build tree: identify parents (objectives referenced by a child's group field)
  const parentIds = new Set(
    visible.filter((o) => o.group).map((o) => o.group!)
  );
  const childrenByParent = new Map<string, ResolvedObjective[]>();
  const groupedChildIds = new Set<string>();

  for (const obj of visible) {
    if (obj.group && parentIds.has(obj.group)) {
      const children = childrenByParent.get(obj.group) ?? [];
      children.push(obj);
      childrenByParent.set(obj.group, children);
      groupedChildIds.add(obj.id);
    }
  }

  // Build render items in original order, skipping grouped children (they render under parent)
  type RenderItem =
    | { type: "single"; obj: ResolvedObjective }
    | { type: "group"; group: GroupNode };

  const renderItems: RenderItem[] = [];
  for (const obj of visible) {
    if (groupedChildIds.has(obj.id)) continue;
    if (parentIds.has(obj.id) && childrenByParent.has(obj.id)) {
      renderItems.push({
        type: "group",
        group: { parent: obj, children: childrenByParent.get(obj.id)! },
      });
    } else {
      renderItems.push({ type: "single", obj });
    }
  }

  // Split into required/optional at top level
  const required = renderItems.filter(
    (item) => !(item.type === "single" ? item.obj : item.group.parent).optional
  );
  const optional = renderItems.filter(
    (item) => (item.type === "single" ? item.obj : item.group.parent).optional
  );

  function renderItem(item: RenderItem) {
    if (item.type === "group") {
      return <ObjectiveGroup key={item.group.parent.id} group={item.group} />;
    }
    return <ObjectiveItem key={item.obj.id} obj={item.obj} />;
  }

  return (
    <div
      className="absolute top-2 right-2 z-10 pointer-events-auto
        bg-[#1a1f29]/85 border border-[#2a2f3a] rounded-md
        backdrop-blur-sm font-mono text-xs select-none
        max-w-[240px]"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-2 py-1.5
          text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
      >
        <span className="text-[#58a6ff] font-bold truncate">
          {chapter.title}
        </span>
        <span className="ml-2 shrink-0">
          {collapsed ? `[${done}/${visible.length}]` : "−"}
        </span>
      </button>

      {!collapsed && (
        <ul className="px-2 pb-1.5 space-y-0.5">
          {required.map(renderItem)}
          {optional.length > 0 && (
            <>
              <li className="text-[#8b949e] text-center">── Optional ──</li>
              {optional.map(renderItem)}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
