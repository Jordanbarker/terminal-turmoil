"use client";

import { useGameStore } from "../../state/gameStore";

export default function StatusBar() {
  const cwd = useGameStore((s) => s.cwd);
  const chapter = useGameStore((s) => s.currentChapter);
  const gamePhase = useGameStore((s) => s.gamePhase);
  const activeComputer = useGameStore((s) => s.activeComputer);

  let leftText: string;
  if (gamePhase === "playing") {
    leftText = cwd;
  } else if (gamePhase === "transitioning") {
    leftText = "Shutting down...";
  } else if (activeComputer === "home") {
    leftText = "Personal Workstation";
  } else {
    leftText = "NexaCorp Internal Systems";
  }

  let rightText: string;
  if (gamePhase === "login") {
    rightText = "Login Required";
  } else if (gamePhase === "booting") {
    rightText = "Authenticating...";
  } else if (gamePhase === "transitioning") {
    rightText = "Shutting down...";
  } else {
    rightText = chapter.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div className="flex items-center justify-between px-4 py-1 bg-[#1a1f29] text-[#6c7380] text-xs font-mono border-t border-[#2a2f3a]">
      <span>{leftText}</span>
      <span>{rightText}</span>
    </div>
  );
}
