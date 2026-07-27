import { setEditorOpenTriggers, type EditorOpenTrigger } from "@tt/core/commands/editorTriggers";

/**
 * Files whose editing the story cares about. The engine matches them inside the
 * editor builtins (see @tt/core/commands/editorTriggers) and fires `events` on
 * exit once every condition holds; the corresponding flags are wired in
 * storyFlags.ts.
 */
export const EDITOR_OPEN_TRIGGERS: EditorOpenTrigger[] = [
  {
    // Olive's first quest: `~/scripts/backup.sh` logs "$BAKCUP_DIR" on its last
    // line, which is why the nightly backup dies with an unbound-variable
    // error. Any save used to complete the objective, so opening the file and
    // pressing Ctrl+O counted as fixing it. The predicate is what the failure
    // email actually names: the misspelling has to be gone.
    computer: "home",
    pathSuffix: "/scripts/backup.sh",
    contentPredicate: (content) => !content.includes("BAKCUP_DIR"),
    events: [{ type: "file_read", detail: "fixed_backup_script" }],
  },
];

setEditorOpenTriggers(EDITOR_OPEN_TRIGGERS);
