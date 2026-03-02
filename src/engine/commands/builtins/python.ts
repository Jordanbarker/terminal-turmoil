import { registerAsync } from "../registry";
import { AsyncCommandHandler } from "../types";
import { getPyodide } from "../../python/pyodideLoader";
import { resolvePath } from "../../../lib/pathUtils";
import { colorize, ansi } from "../../../lib/ansi";
import { HELP_TEXTS } from "./helpTexts";

const pythonHandler: AsyncCommandHandler = async (args, flags, ctx) => {
  // python -c "code" — inline execution
  if (flags.c) {
    const code = args.join(" ");
    if (!code) {
      return { output: "python: option requires an argument -- 'c'" };
    }
    return runCode(code);
  }

  // python script.py [args...] — file execution
  if (args.length > 0) {
    const filePath = resolvePath(args[0], ctx.cwd, ctx.homeDir);
    const result = ctx.fs.readFile(filePath);
    if (result.error) {
      return { output: `python: can't open file '${args[0]}': ${result.error}` };
    }
    return runCode(result.content!);
  }

  // python (no args) — launch REPL
  return { output: "", interactiveSession: { type: "pythonRepl" } };
};

async function runCode(code: string): Promise<{ output: string }> {
  try {
    const pyodide = await getPyodide();

    let output = "";
    pyodide.setStdout({
      batched: (text: string) => {
        output += text + "\n";
      },
    });
    pyodide.setStderr({
      batched: (text: string) => {
        output += text + "\n";
      },
    });

    pyodide.runPython(code);
    return { output: output.replace(/\n$/, "") };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("SystemExit")) {
      return { output: "" };
    }
    const lines = errMsg.split("\n").filter((l) => l.trim());
    const lastLine = lines[lines.length - 1] || errMsg;
    return { output: colorize(lastLine, ansi.red) };
  }
}

const description = "Run Python scripts or start an interactive Python REPL";
registerAsync("python", pythonHandler, description, HELP_TEXTS.python);
registerAsync("python3", pythonHandler, description, HELP_TEXTS.python);
