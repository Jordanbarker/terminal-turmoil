import { setEnvExportTriggers, type EnvExportTrigger } from "@tt/core/commands/envTriggers";
import { CHIPINFRA_PATHS } from "./filesystem/paths";

/**
 * Environment assignments the story cares about. The engine matches them inside
 * the `export` builtin (see @tt/core/commands/envTriggers); the corresponding
 * flags are wired in storyFlags.ts.
 */
/**
 * The key Edward's Piper DM hands the player. Single source of truth: the
 * `chip` builtin rejects anything else, so a key that starts Chip and a key
 * that ticks the objective are the same key by construction.
 */
export const CHIP_API_KEY = "nxa_live_7f3k9m2x";

export const ENV_EXPORT_TRIGGERS: EnvExportTrigger[] = [
  // Matched by both `export` and `source`, so however the key reaches the
  // environment the same beat advances — and an unedited `source ~/.zshrc`
  // advances nothing.
  { key: "CHIP_API_KEY", value: CHIP_API_KEY, detail: "exported_chip_api_key" },
  // The chipinfra pivot: matching on the resolved path means relative forms
  // (`agent.18472` from inside the socket dir) count, exactly as connect(2) would.
  { key: "SSH_AUTH_SOCK", path: CHIPINFRA_PATHS.erikAgentSocket, detail: "exported_erik_ssh_auth_sock" },
];

setEnvExportTriggers(ENV_EXPORT_TRIGGERS);
