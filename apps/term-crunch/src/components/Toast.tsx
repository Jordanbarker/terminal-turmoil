"use client";

import { useEffect } from "react";
import { useGameStore } from "../state/gameStore";

const TOAST_DURATION_MS = 4000;

/** Transient corner notifications (currently just copy-mode yank feedback). */
export default function Toast() {
  const toasts = useGameStore((s) => s.toasts);
  const removeToast = useGameStore((s) => s.removeToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => removeToast(toasts[0].id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toasts, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-12 right-2 z-20 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="max-w-[280px] rounded-md border border-[#e6b450]/40 bg-[#11161d]/90 px-3 py-2 font-mono text-xs text-[#b3b1ad] backdrop-blur-sm"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
