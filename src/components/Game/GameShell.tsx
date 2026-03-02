"use client";

import dynamic from "next/dynamic";
import StatusBar from "../HUD/StatusBar";
import AssistantOverlay from "../Assistant/AssistantOverlay";
import ObjectiveTracker from "../HUD/ObjectiveTracker";
import Toast from "../HUD/Toast";
import { useGameStore } from "../../state/gameStore";

// Dynamic import: xterm.js requires window
const Terminal = dynamic(() => import("../Terminal/Terminal"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#0a0e14] text-[#6c7380] font-mono">
      Initializing terminal...
    </div>
  ),
});

export default function GameShell() {
  const gamePhase = useGameStore((s) => s.gamePhase);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0e14] overflow-hidden">
      <div className="flex-1 relative min-h-0">
        <Terminal />
        {gamePhase === "playing" && (
          <>
            <ObjectiveTracker />
            <AssistantOverlay />
          </>
        )}
        <Toast />
      </div>
      <StatusBar />
    </div>
  );
}
