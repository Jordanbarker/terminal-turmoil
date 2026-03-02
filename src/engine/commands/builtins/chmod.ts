import { CommandHandler } from "../types";
import { register } from "../registry";
import { resolvePath } from "../../../lib/pathUtils";
import { HELP_TEXTS } from "./helpTexts";

function octalToPermString(octal: string): string | null {
  if (!/^[0-7]{3}$/.test(octal)) return null;

  const map: Record<string, string> = {
    "0": "---", "1": "--x", "2": "-w-", "3": "-wx",
    "4": "r--", "5": "r-x", "6": "rw-", "7": "rwx",
  };

  return octal.split("").map((d) => map[d]).join("");
}

const chmod: CommandHandler = (args, _flags, ctx) => {
  if (args.length < 2) {
    return { output: "chmod: missing operand\nUsage: chmod MODE FILE" };
  }

  const mode = args[0];
  const filePath = args[1];
  const permissions = octalToPermString(mode);

  if (!permissions) {
    return { output: `chmod: invalid mode: '${mode}'` };
  }

  const absPath = resolvePath(filePath, ctx.cwd, ctx.homeDir);
  const result = ctx.fs.setPermissions(absPath, permissions);

  if (result.error) {
    return { output: result.error };
  }

  return { output: "", newFs: result.fs };
};

register("chmod", chmod, "Change file permissions", HELP_TEXTS.chmod);
