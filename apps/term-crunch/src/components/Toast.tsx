"use client";

import { useEffect } from "react";
import { useGameStore } from "../state/gameStore";

const TOAST_DURATION_MS = 4000;

/**
 * One toast, owning its own dismissal timer. The timer has to live per toast:
 * a single effect over the whole list would restart on every add and only ever
 * time the head of the queue, so a burst of toasts would keep each other alive
 * and the tail would never expire.
 */
function ToastItem({ id, message }: { id: string; message: string }) {
  const removeToast = useGameStore((s) => s.removeToast);

  useEffect(() => {
    const timer = setTimeout(() => removeToast(id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [id, removeToast]);

  return (
    <div className="max-w-[280px] rounded-md border border-[#e6b450]/40 bg-[#11161d]/90 px-3 py-2 font-mono text-xs text-[#b3b1ad] backdrop-blur-sm">
      {message}
    </div>
  );
}

/** Transient corner notifications (currently just copy-mode yank feedback). */
export default function Toast() {
  const toasts = useGameStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute bottom-12 right-2 z-20 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} id={toast.id} message={toast.message} />
      ))}
    </div>
  );
}
