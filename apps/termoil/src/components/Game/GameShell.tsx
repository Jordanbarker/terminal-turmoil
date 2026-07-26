"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import StatusBar from "../HUD/StatusBar";
import ObjectiveTracker from "../HUD/ObjectiveTracker";
import Toast from "../HUD/Toast";
import { useGameStore } from "../../state/gameStore";
import { startObjectivePromotion } from "../../state/objectivePromotion";
import { useBeforeUnloadGuard } from "../../hooks/useBeforeUnloadGuard";

// Dynamic import: xterm.js requires window
const TabManager = dynamic(() => import("../Terminal/TabManager"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#0a0e14] text-[#6c7380] font-mono">
      Initializing terminal...
    </div>
  ),
});

export default function GameShell() {
  const gamePhase = useGameStore((s) => s.gamePhase);
  useBeforeUnloadGuard(gamePhase === "playing");

  // Objective promotion is subscribed at the shell (never unmounted) rather
  // than in the HUD, which unmounts on every transition.
  useEffect(() => startObjectivePromotion(), []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0e14] overflow-hidden">
      <div className="flex-1 relative min-h-0">
        <TabManager />
        {gamePhase === "playing" && <ObjectiveTracker />}
        <Toast />
      </div>
      <StatusBar />
    </div>
  );
}
