// App-side builtin registration. Pulls in the core builtin set (which
// self-registers into @tt/core's command registry), then registers this
// game's story-coupled builtins (machine topology, player identity,
// checkpoints) which also self-register into the same registry, plus the
// story seams the engine's own builtins read: the script interceptor (authored
// output for ~/scripts/auto_apply.py), the `export`/`source` env trigger table,
// the editor-open trigger table, the diff trigger, the SQL query trigger
// table, and the Snowflake/dbt warehouse identity.
import "@tt/core/commands/builtins";
import "../scriptInterceptor";
import "../../../story/envTriggers";
import "../../../story/editorTriggers";
import "../../../story/diffTriggers";
import "../../../story/queryTriggers";
import "../../../story/warehouseIdentity";
import "./save";
import "./load";
import "./newgame";
import "./hostname";
import "./shutdown";
import "./mail";
import "./cheat";
import "./ssh";
import "./ssh-add";
import "./coder";
import "./exit";
import "./apt";
import "./chip";
import "./piper";

// man NAME lines for the builtins above (core seeds only its own).
import { registerManSummaries } from "@tt/core/commands/builtins/man";
import { TERMOIL_MAN_SUMMARIES } from "./helpTexts";

registerManSummaries(TERMOIL_MAN_SUMMARIES);
