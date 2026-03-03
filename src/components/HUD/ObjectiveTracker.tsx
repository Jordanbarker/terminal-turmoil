"use client";

import { useState } from "react";
import { useGameStore } from "../../state/gameStore";
import { CHAPTERS } from "../../engine/narrative/chapters";
import { resolveObjectives } from "../../engine/narrative/objectives";

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

  const visible = objectives.filter((o) => o.visible);
  const done = visible.filter((o) => o.completed).length;

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

      {!collapsed && (() => {
        const required = visible.filter((o) => !o.optional);
        const optional = visible.filter((o) => o.optional);
        return (
          <ul className="px-2 pb-1.5 space-y-0.5">
            {required.map((obj) => (
              <li
                key={obj.id}
                className={
                  obj.completed
                    ? "text-[#3fb950] line-through opacity-50"
                    : "text-[#c9d1d9]"
                }
              >
                {obj.completed ? "[x]" : "[ ]"} {obj.description}
              </li>
            ))}
            {optional.length > 0 && (
              <>
                <li className="text-[#8b949e] text-center">── Optional ──</li>
                {optional.map((obj) => (
                  <li
                    key={obj.id}
                    className={
                      obj.completed
                        ? "text-[#3fb950] line-through opacity-50"
                        : "text-[#c9d1d9]"
                    }
                  >
                    {obj.completed ? "[x]" : "[ ]"} {obj.description}
                  </li>
                ))}
              </>
            )}
          </ul>
        );
      })()}
    </div>
  );
}
