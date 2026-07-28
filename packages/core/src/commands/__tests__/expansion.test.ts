import { describe, it, expect } from "vitest";
import { runPipeline, RunPipelineOptions } from "../runPipeline";
import { parseChainedPipeline, expandAliases } from "../parser";
import { CommandContext, CommandResult, ParsedCommand } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { file, dir } from "../../filesystem/builders";
import { stripAnsi } from "../../lib/ansi";
import { executeScript } from "../builtins/bash";
import "../builtins";

const HOME = "/home/player";

function createTestFS(): VirtualFS {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", {
        "a.log": file("a.log", "alpha\n"),
        "b.log": file("b.log", "beta\n"),
        "c.txt": file("c.txt", "gamma\n"),
        "notes.md": file("notes.md", "notes\n"),
        ".hidden.log": file(".hidden.log", "secret\n"),
        "*.tmp": file("*.tmp", "literally starred\n"),
        docs: dir("docs", {
          one: dir("one", { "keep.txt": file("keep.txt", "1\n") }),
          two: dir("two", { "keep.txt": file("keep.txt", "2\n") }),
          "flat.txt": file("flat.txt", "flat\n"),
        }),
        deep: dir("deep", {
          "top.log": file("top.log", "t\n"),
          ".hide": dir(".hide", { "buried.log": file("buried.log", "h\n") }),
          mid: dir("mid", {
            "mid.log": file("mid.log", "m\n"),
            leaf: dir("leaf", { "leaf.log": file("leaf.log", "l\n"), "note.txt": file("note.txt", "n\n") }),
          }),
        }),
      }),
    }),
    var: dir("var", {
      log: dir("log", {
        "app.log": file("app.log", "line one\nerror: boom\n"),
        "sys.log": file("sys.log", "quiet\n"),
      }),
    }),
  });
  return new VirtualFS(root, HOME, HOME);
}

interface RunOutcome {
  /** Concatenated stdout of every segment, ANSI-stripped. */
  output: string;
  /** Concatenated stderr of every segment. */
  stderr: string;
  /** Anything `runPipeline` wrote straight to the terminal (nomatch, redirect errors). */
  written: string;
  /** argv of the last command of each segment that actually ran. */
  argv: string[][];
  exitCode: number;
  fs: VirtualFS;
  env: Record<string, string>;
}

async function run(
  input: string,
  init?: { env?: Record<string, string>; aliases?: Record<string, string>; cwd?: string; fs?: VirtualFS; initialExitCode?: number },
): Promise<RunOutcome> {
  const fs = init?.fs ?? createTestFS();
  const cwd = init?.cwd ?? HOME;
  let envVars: Record<string, string> = { ...init?.env };
  let aliases: Record<string, string> = { ...init?.aliases };
  const output: string[] = [];
  const stderr: string[] = [];
  const argv: string[][] = [];
  let written = "";

  const opts: RunPipelineOptions = {
    chain: parseChainedPipeline(expandAliases(input, aliases)),
    fs,
    cwd,
    homeDir: HOME,
    initialExitCode: init?.initialExitCode,
    buildContext: ({ fs, cwd, stdin, rawArgs, isPiped }): CommandContext => ({
      fs,
      cwd,
      homeDir: HOME,
      username: "player",
      activeComputer: "home",
      stdin,
      rawArgs,
      isPiped,
      commandHistory: [],
      envVars,
      setEnvVars: (e) => { envVars = e; },
      aliases,
      setAliases: (a) => { aliases = a; },
    }),
    write: (t) => { written += stripAnsi(t); },
    redirection: { computerId: "home" },
    applySegment: (result: CommandResult, lastParsed: ParsedCommand) => {
      if (result.output) output.push(stripAnsi(result.output));
      if (result.stderr) stderr.push(result.stderr);
      argv.push([lastParsed.command, ...lastParsed.args]);
      return { newCwd: result.newCwd };
    },
  };

  const res = await runPipeline(opts);
  return {
    output: output.join("\n"),
    stderr: stderr.join("\n"),
    written,
    argv,
    exitCode: res.lastExitCode,
    fs: res.fs,
    env: envVars,
  };
}

describe("glob expansion", () => {
  it("expands `*` and sorts the matches lexicographically", async () => {
    const r = await run("echo *.log");
    expect(r.output).toBe("a.log b.log");
  });

  it("expands `?` to exactly one character", async () => {
    const r = await run("echo ?.log");
    expect(r.output).toBe("a.log b.log");
    expect((await run("echo ??.log")).written).toContain("zsh: no matches found: ??.log");
  });

  it("expands a `[...]` character class, including negation and ranges", async () => {
    expect((await run("echo [ab].log")).output).toBe("a.log b.log");
    expect((await run("echo [a-b].log")).output).toBe("a.log b.log");
    expect((await run("echo [!a].log")).output).toBe("b.log");
  });

  it("expands each path segment independently", async () => {
    const r = await run("echo docs/*/keep.txt");
    expect(r.output).toBe("docs/one/keep.txt docs/two/keep.txt");
  });

  it("only matches directories for a non-final segment", async () => {
    // docs/flat.txt is a file, so it cannot satisfy `docs/*/keep.txt` above.
    expect((await run("echo docs/*")).output).toBe("docs/flat.txt docs/one docs/two");
  });

  it("never matches dotfiles unless the pattern starts with a dot", async () => {
    expect((await run("echo *.log")).output).not.toContain(".hidden.log");
    expect((await run("echo .*.log")).output).toBe(".hidden.log");
  });

  it("expands `~` to the home directory and yields absolute paths", async () => {
    const r = await run("echo ~/*.md", { cwd: "/" });
    expect(r.output).toBe("/home/player/notes.md");
  });

  it("expands an absolute pattern", async () => {
    const r = await run("echo /var/log/*.log");
    expect(r.output).toBe("/var/log/app.log /var/log/sys.log");
  });

  it("reports zsh nomatch and does NOT run the command", async () => {
    const r = await run("rm *.nope");
    expect(r.written).toBe("zsh: no matches found: *.nope");
    expect(r.argv).toEqual([]); // applySegment never fired: nothing executed
    expect(r.exitCode).toBe(1);
  });

  it("nomatch fails the segment for `&&` chaining", async () => {
    const r = await run("echo *.nope && echo after");
    expect(r.output).toBe("");
    expect((await run("echo *.nope || echo after")).output).toBe("after");
  });

  it("leaves a quoted pattern literal", async () => {
    expect((await run("echo '*.log'")).output).toBe("*.log");
    expect((await run('echo "*.log"')).output).toBe("*.log");
    // ...and a quoted pattern really can name a file
    expect((await run("cat '*.tmp'")).output.trim()).toBe("literally starred");
  });

  it("does not glob redirect targets", async () => {
    const r = await run("echo hi > out*.txt");
    expect(r.exitCode).toBe(0);
    expect(r.fs.readFile(`${HOME}/out*.txt`).content?.trim()).toBe("hi");
  });

  it("expands the arguments a piped stage sees", async () => {
    const r = await run("grep -l error /var/log/*.log");
    expect(r.argv[0]).toEqual(["grep", "error", "/var/log/app.log", "/var/log/sys.log"]);
  });

  it("leaves a word with no metacharacter untouched", async () => {
    const r = await run("echo notes.md");
    expect(r.output).toBe("notes.md");
  });
});

describe("glob expansion: invalid patterns degrade instead of throwing", () => {
  // These all compile to a JS character class the RegExp constructor rejects.
  // Before the guard the throw escaped runPipeline and killed the shell.
  for (const pattern of ["[9-0]", "[z-a]", "[b-a]x", "a[]-[]b", "[a-[-]", "[9-0]*.log"]) {
    it(`treats ${pattern} as a literal filename`, async () => {
      let outcome: RunOutcome | undefined;
      await expect(
        (async () => { outcome = await run(`ls ${pattern}`); })(),
      ).resolves.toBeUndefined();
      // Nothing is named that, so ls reports it — the shell stays alive.
      expect(outcome!.stderr).toContain(pattern);
      expect(outcome!.written).toBe("");
    });
  }

  it("keeps a valid class working next to the invalid-range guard", async () => {
    expect((await run("echo [a-b].log")).output).toBe("a.log b.log");
  });
});

describe("recursive ** (globstar)", () => {
  it("matches zero or more directory levels", async () => {
    const r = await run("echo deep/**/*.log");
    expect(r.output).toBe("deep/mid/leaf/leaf.log deep/mid/mid.log deep/top.log");
  });

  it("works from an absolute base", async () => {
    expect((await run("echo /home/player/deep/**/*.txt")).output)
      .toBe("/home/player/deep/mid/leaf/note.txt");
  });

  it("still skips dotted directories at every level", async () => {
    expect((await run("echo deep/**/*.log")).output).not.toContain(".hide");
  });

  it("a trailing ** means everything underneath", async () => {
    expect((await run("echo deep/**")).output)
      .toBe("deep/mid deep/mid/leaf deep/mid/leaf/leaf.log deep/mid/leaf/note.txt deep/mid/mid.log deep/top.log");
  });

  it("returns each match once and in lexicographic order", async () => {
    const matches = (await run("echo deep/**/*.log")).output.split(" ");
    expect(new Set(matches).size).toBe(matches.length);
    expect([...matches].sort()).toEqual(matches);
  });

  it("is literal when quoted", async () => {
    expect((await run("echo 'deep/**/*.log'")).output).toBe("deep/**/*.log");
  });

  it("nomatches like any other pattern", async () => {
    expect((await run("echo deep/**/*.nope")).written).toContain("zsh: no matches found:");
  });
});

describe("assignment words are not globbed", () => {
  it("export FOO=*.log stores the pattern instead of aborting", async () => {
    const r = await run("export FOO=*.log");
    expect(r.written).toBe("");
    expect(r.env.FOO).toBe("*.log");
  });

  it("alias q=* is accepted", async () => {
    const r = await run("alias q=*");
    expect(r.written).toBe("");
    expect(r.exitCode).toBe(0);
  });

  it("still expands variables on an assignment's right-hand side", async () => {
    expect((await run("export P=$HOME/docs")).env.P).toBe(`${HOME}/docs`);
  });

  it("still globs a NON-assignment operand of the same command", async () => {
    // `export` with a bare word is a no-op, but the word is still a filename
    // position, so zsh globs it.
    expect((await run("export *.nope")).written).toContain("zsh: no matches found: *.nope");
  });

  it("does not exempt assignment-shaped words of other commands", async () => {
    // No file is called `FOO=…`, so for `echo` this is an ordinary nomatch.
    expect((await run("echo FOO=*.log")).written).toContain("zsh: no matches found: FOO=*.log");
  });
});

describe("variable expansion", () => {
  it("expands $VAR unquoted and inside double quotes", async () => {
    expect((await run("echo $GREETING", { env: { GREETING: "hi there" } })).output).toBe("hi there");
    expect((await run('echo "[$GREETING]"', { env: { GREETING: "hi" } })).output).toBe("[hi]");
  });

  it("does NOT word-split an unquoted value that contains spaces", async () => {
    // Deliberate simplification: one word in, one word out. A path with a space
    // in it survives `cat $F` instead of arriving as two bogus operands.
    const r = await run("echo $GREETING", { env: { GREETING: "hi there" } });
    expect(r.argv[0]).toEqual(["echo", "hi there"]);
  });

  it("never expands inside single quotes", async () => {
    expect((await run("echo '$GREETING'", { env: { GREETING: "hi" } })).output).toBe("$GREETING");
  });

  it("supports ${VAR} braces", async () => {
    expect((await run("echo ${A}B", { env: { A: "x" } })).output).toBe("xB");
  });

  it("expands an undefined variable to the empty string", async () => {
    // Unquoted and empty, the word disappears entirely (zsh word splitting).
    const r = await run("echo $NOPE");
    expect(r.output.trim()).toBe("");
    expect(r.argv[0]).toEqual(["echo"]);
  });

  it("leaves $(...) and backticks literal", async () => {
    expect((await run("echo $(whoami)")).output).toBe("$(whoami)");
    expect((await run("echo `whoami`")).output).toBe("`whoami`");
  });

  it("expands $? to the PREVIOUS command's exit code across a chain", async () => {
    expect((await run("true; echo $?")).output).toBe("0");
    expect((await run("false; echo $?")).output).toBe("1");
  });

  it("falls back to shell-managed HOME/USER/PWD when the env map lacks them", async () => {
    expect((await run("echo $HOME")).output).toBe(HOME);
    expect((await run("echo $USER")).output).toBe("player");
    expect((await run("echo $PWD", { cwd: "/var/log" })).output).toBe("/var/log");
  });

  it("lets an explicitly exported value win over the shell-managed fallback", async () => {
    expect((await run("echo $PWD", { env: { PWD: "/env/pwd" } })).output).toBe("/env/pwd");
    expect((await run("echo $HOME", { env: { HOME: "/env/home" } })).output).toBe("/env/home");
    expect((await run("export PWD=/env/pwd && echo $PWD")).output).toBe("/env/pwd");
  });

  it("works with export and cd", async () => {
    const r = await run("export TARGET=$HOME/docs && cd $TARGET && pwd");
    expect(r.env.TARGET).toBe(`${HOME}/docs`);
    expect(r.output).toBe(`${HOME}/docs`);
  });

  it("sees a variable exported earlier in the same chain", async () => {
    expect((await run("export X=set && echo $X")).output).toBe("set");
  });

  it("expands variables in a command word", async () => {
    expect((await run("$CMD hello", { env: { CMD: "echo" } })).output).toBe("hello");
  });
});

describe("expansion ordering", () => {
  it("expands variables before globs, and does NOT re-glob a variable's value", async () => {
    // The value holds `*`, but the pattern character came from the expansion,
    // so it stays literal and names the real `*.tmp` file.
    const r = await run("cat $P", { env: { P: "*.tmp" } });
    expect(r.output.trim()).toBe("literally starred");
  });

  it("globs a pattern that a variable only contributed a literal prefix to", async () => {
    const r = await run("echo $D/*.txt", { env: { D: "docs" } });
    expect(r.output).toBe("docs/flat.txt");
  });

  it("does not expand a tilde that came out of a variable", async () => {
    // `~` is a shell character only when typed, exactly like `*`. Typed, it is
    // the home directory; from a variable it is a filename character, so the
    // pattern looks for a directory literally called `~` in the cwd.
    expect((await run("echo ~/*.md", { cwd: "/" })).output).toBe("/home/player/notes.md");
    expect((await run("echo $P/*.md", { cwd: "/", env: { P: "~" } })).written)
      .toContain("zsh: no matches found: $P/*.md");
  });

  it("runs after alias expansion, so an alias body can carry a pattern", async () => {
    const r = await run("lslogs", { aliases: { lslogs: "echo *.log" } });
    expect(r.output).toBe("a.log b.log");
  });

  it("expands a variable inside an alias body", async () => {
    const r = await run("hi", { aliases: { hi: "echo $WHO" }, env: { WHO: "ren" } });
    expect(r.output).toBe("ren");
  });
});

describe("$? across submitted lines (initialExitCode)", () => {
  /** One shell, several submitted lines: what the apps' per-pane state does. */
  async function shell(lines: string[]): Promise<string[]> {
    const fs = createTestFS();
    const outputs: string[] = [];
    let carried: number | undefined;
    for (const line of lines) {
      const r = await run(line, { fs, initialExitCode: carried });
      carried = r.exitCode;
      outputs.push(r.output.trim());
    }
    return outputs;
  }

  it("carries the previous line's exit code into the next line", async () => {
    expect(await shell(["false", "echo $?"])).toEqual(["", "1"]);
    expect(await shell(["true", "echo $?"])).toEqual(["", "0"]);
  });

  it("carries a real command's failure", async () => {
    const [, code] = await shell(["cat nosuch.txt", "echo $?"]);
    expect(code).toBe("1");
  });

  it("starts a fresh shell at 0", async () => {
    expect(await shell(["echo $?"])).toEqual(["0"]);
  });

  it("a chain still reports its LAST segment's status to the next line", async () => {
    expect(await shell(["false || true", "echo $?"])).toEqual(["", "0"]);
  });

  it("an early-returning line still hands its status on", async () => {
    // `nano` opens a session and breaks the chain; the exit code must survive.
    expect(await shell(["false", "nano notes.md", "echo $?"])).toEqual(["", "", "0"]);
  });
});

describe("bash script variable expansion (shared implementation)", () => {
  const ctx = (fs: VirtualFS, env: Record<string, string>): CommandContext => ({
    fs,
    cwd: HOME,
    homeDir: HOME,
    username: "player",
    activeComputer: "home",
    envVars: env,
  });

  it("keeps script-local variables shadowing the environment", async () => {
    const fs = createTestFS();
    const r = await executeScript('NAME=script\necho $NAME', ctx(fs, { NAME: "env" }));
    expect(r.output).toBe("script");
  });

  it("falls through to the environment for a variable the script never sets", async () => {
    const fs = createTestFS();
    const r = await executeScript("echo $DEPLOY_ENV", ctx(fs, { DEPLOY_ENV: "prod" }));
    expect(r.output).toBe("prod");
  });

  it("still supports ${VAR:-default} and positional args", async () => {
    const fs = createTestFS();
    expect((await executeScript("echo ${MISSING:-fallback}", ctx(fs, {}))).output).toBe("fallback");
    expect((await executeScript("echo $1-$2", ctx(fs, {}), ["a", "b"])).output).toBe("a-b");
  });

  it("still expands $(...) after the variable pass", async () => {
    const fs = createTestFS();
    const r = await executeScript('echo "user=$(whoami)"', ctx(fs, {}));
    expect(r.output).toBe("user=player");
  });

  it("does not glob (script patterns stay literal)", async () => {
    const fs = createTestFS();
    const r = await executeScript("echo *.log", ctx(fs, {}));
    expect(r.output).toBe("*.log");
  });
});
