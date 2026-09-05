// Story diff trigger: discovered_log_tampering fires when the player compares
// the tampered system.log against its .bak copy. Injected into @tt/core's
// diff builtin at import time (see engine/commands/builtins/index.ts).
import { setDiffTrigger } from "@tt/core/commands/diffTriggers";

setDiffTrigger((args) => {
  const hasBak = args.some((a) => a.includes(".bak"));
  const hasLog = args.some((a) => a.includes("system.log") && !a.includes(".bak"));
  if (hasBak && hasLog) {
    return [{ type: "file_read", detail: "discovered_log_tampering" }];
  }
  return null;
});
