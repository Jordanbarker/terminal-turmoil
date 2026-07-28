import { register } from "@tt/core/commands/registry";
import { setKnownFlags } from "@tt/core/commands/flagValidation";
import { HELP_TEXTS } from "./helpTexts";
import { CHIP_API_KEY } from "../../../story/envTriggers";

register(
  "chip",
  (_args, _flags, ctx) => {
    const key = ctx.envVars?.CHIP_API_KEY;
    if (!key) {
      return {
        output: "",
        stderr: "chip: error: CHIP_API_KEY not set",
        exitCode: 1,
        triggerEvents: [{ type: "command_executed", detail: "chip_api_error" }],
      };
    }
    // A key the gateway would reject must not start a session: otherwise a
    // typo'd key gives the player a working Chip while the "set CHIP_API_KEY"
    // objective stays open (or the reverse), and the two never reconcile.
    if (key !== CHIP_API_KEY) {
      return {
        output: "",
        stderr: [
          "chip: error: invalid API key",
          "chip.platform.internal rejected the key in CHIP_API_KEY (401 Unauthorized).",
        ].join("\n"),
        exitCode: 1,
        triggerEvents: [{ type: "command_executed", detail: "chip_api_error" }],
      };
    }
    return {
      output: "",
      chipSession: { storyFlags: ctx.storyFlags ?? {}, currentComputer: ctx.activeComputer },
    };
  },
  "Chat with NexaCorp's AI assistant",
  HELP_TEXTS.chip
);
setKnownFlags("chip", {});
