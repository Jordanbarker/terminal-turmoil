import { describe, it, expect } from "vitest";
import { runPipeline, RunPipelineOptions } from "../runPipeline";
import { parseChainedPipeline } from "../parser";
import { computeEffects } from "../applyResult";
import { execute } from "../registry";
import { CommandContext, CommandResult } from "../types";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { file, dir } from "../../filesystem/builders";
import { stripAnsi } from "../../lib/ansi";
import "../builtins";

/**
 * The stdout/stderr split. A diagnostic must never reach `CommandResult.output`:
 * that is the channel a pipe feeds downstream and a `>` redirect writes into a
 * file. Before the split, `lss x > some_file` wrote "zsh: command not found: lss"
 * INTO the target file and printed nothing.
 */

const HOME = "/home/player";
const MAIL = "/var/mail/player/new/003_job_offer";
const OFFER = "From: Edward Torres\nSubject: Job Offer\n\nStart Monday.\n";

function createTestFS(): VirtualFS {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", {
        "notes.txt": file("notes.txt", "alpha\nbeta\ngamma\n"),
        "notes.bak": file("notes.bak", "alpha\nBETA\ngamma\n"),
      }),
    }),
    var: dir("var", {
      mail: dir("mail", {
        player: dir("player", {
          new: dir("new", { "003_job_offer": file("003_job_offer", OFFER) }),
        }),
      }),
    }),
  });
  return new VirtualFS(root, HOME, HOME);
}

interface Run {
  fs: VirtualFS;
  /** Everything the player would see: written mid-pipeline plus each segment's effects. */
  screen: string;
  exitCode: number;
  results: CommandResult[];
}

/** Run a line the way both apps do: runPipeline + computeEffects for the display text. */
async function run(input: string, fs: VirtualFS = createTestFS()): Promise<Run> {
  const written: string[] = [];
  const results: CommandResult[] = [];
  let envVars: Record<string, string> = {};
  let aliases: Record<string, string> = {};

  const opts: RunPipelineOptions = {
    chain: parseChainedPipeline(input),
    fs,
    cwd: HOME,
    homeDir: HOME,
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
    write: (t) => written.push(t),
    redirection: { computerId: "home" },
    applySegment: (result, parsed, state) => {
      results.push(result);
      const effects = computeEffects(result, {
        parsedCommand: parsed.command,
        parsedArgs: parsed.args,
        cwd: state.cwd,
        homeDir: HOME,
        activeComputer: "home",
        username: "player",
        deliveredEmailIds: [],
        deliveredPiperIds: [],
        storyFlags: {},
        fs: state.fs,
      });
      written.push(effects.output);
      return {};
    },
  };

  const out = await runPipeline(opts);
  return { fs: out.fs, screen: stripAnsi(written.join("\n")), exitCode: out.lastExitCode, results };
}

describe("redirecting a command that fails", () => {
  it("leaves the target truncated-but-empty and puts the error on the terminal", async () => {
    const r = await run("lss x > out.txt");
    expect(r.fs.readFile(`${HOME}/out.txt`).content).toBe("");
    expect(r.screen).toContain("zsh: command not found: lss");
    expect(r.exitCode).toBe(127);
  });

  it("never writes the error into an existing file (the job-offer soft-lock)", async () => {
    const r = await run(`lss x > ${MAIL}`);
    const content = r.fs.readFile(MAIL).content!;
    expect(content).not.toContain("command not found");
    // zsh opens the target before exec, so realism costs the body — but the
    // player at least sees why, instead of a silently corrupted email.
    expect(content).toBe("");
    expect(r.screen).toContain("zsh: command not found: lss");
  });

  it("keeps a read error out of the target too", async () => {
    const r = await run("cat nosuch.txt > out.txt");
    expect(r.fs.readFile(`${HOME}/out.txt`).content).toBe("");
    expect(r.screen).toContain(`cat: ${HOME}/nosuch.txt: No such file or directory`);
  });

  it("still redirects the readable operands of a partly-failing cat", async () => {
    const r = await run("cat notes.txt nosuch.txt > out.txt");
    expect(r.fs.readFile(`${HOME}/out.txt`).content).toBe("alpha\nbeta\ngamma\n");
    expect(r.screen).toContain(`cat: ${HOME}/nosuch.txt: No such file or directory`);
  });

  it("diff's exit-1 report is stdout and still redirects", async () => {
    const r = await run("diff notes.txt notes.bak > out.txt");
    const content = r.fs.readFile(`${HOME}/out.txt`).content!;
    expect(content).toContain("BETA");
    expect(r.results[0].stderr).toBeUndefined();
    expect(r.exitCode).toBe(1);
  });

  it("diff's unreadable operand is stderr, not a diff report", async () => {
    const r = await run("diff notes.txt nosuch.txt > out.txt");
    expect(r.fs.readFile(`${HOME}/out.txt`).content).toBe("");
    expect(r.screen).toContain(`diff: ${HOME}/nosuch.txt: No such file or directory`);
  });
});

describe("piping a command that fails", () => {
  it("cat nosuch | wc -l gives wc empty stdin and prints the error", async () => {
    const r = await run("cat nosuch.txt | wc -l");
    expect(r.screen).toContain(`cat: ${HOME}/nosuch.txt: No such file or directory`);
    expect(r.screen).toMatch(/\b0\b/);
    expect(r.screen).not.toMatch(/\b1\b/);
  });

  it("command-not-found is not piped downstream", async () => {
    const r = await run("lss | wc -l");
    expect(r.screen).toContain("zsh: command not found: lss");
    expect(r.results[0].output).toBe("       0");
  });

  it("mid-pipeline stderr survives even when a later stage succeeds", async () => {
    const r = await run("cat nosuch.txt | grep alpha");
    expect(r.results[0].stderr).toContain(`cat: ${HOME}/nosuch.txt: No such file or directory`);
  });

  it("stderr from a failed stage still reaches the terminal when stdout is redirected", async () => {
    const r = await run("cat nosuch.txt | wc -l > count.txt");
    expect(r.fs.readFile(`${HOME}/count.txt`).content).toBe("       0");
    expect(r.screen).toContain(`cat: ${HOME}/nosuch.txt: No such file or directory`);
  });
});

describe("channel discipline", () => {
  it("a failing builtin reports on stderr with an empty stdout", () => {
    const ctx: CommandContext = {
      fs: createTestFS(),
      cwd: HOME,
      homeDir: HOME,
      username: "player",
      activeComputer: "home",
    };
    for (const [name, args] of [["cat", ["nosuch.txt"]], ["wc", ["nosuch.txt"]], ["rm", ["nosuch.txt"]]] as const) {
      const result = execute(name, [...args], {}, { ...ctx, rawArgs: [...args] });
      expect(result.output, name).toBe("");
      expect(result.stderr, name).toContain("No such file or directory");
    }
  });

  it("computeEffects renders stderr ahead of stdout so both reach the screen", () => {
    const effects = computeEffects({ output: "body", stderr: "boom", exitCode: 1 }, {
      parsedCommand: "cat",
      parsedArgs: [],
      cwd: HOME,
      homeDir: HOME,
      activeComputer: "home",
      username: "player",
      deliveredEmailIds: [],
      deliveredPiperIds: [],
      storyFlags: {},
      fs: createTestFS(),
    });
    expect(effects.output).toBe("boom\nbody");
  });

  it("chain operators still read the failing command's exit code", async () => {
    const r = await run("cat nosuch.txt && echo yes || echo no");
    expect(r.screen).toContain("no");
    expect(r.screen).not.toContain("yes");
  });
});

describe("git / dbt / snow diagnostics", () => {
  it("git's not-a-repo error stays out of the redirect target", async () => {
    const r = await run("git status > g1.txt");
    expect(r.fs.readFile(`${HOME}/g1.txt`).content).toBe("");
    expect(r.screen).toContain("fatal: not a git repository");
    expect(r.exitCode).toBe(128);
  });

  it("git is internally consistent: flag errors and subcommand errors share the channel", async () => {
    const flagErr = await run("git status -z");
    const cmdErr = await run("git frobnicate");
    for (const r of [flagErr, cmdErr]) {
      expect(r.results[0].output).toBe("");
      expect(r.results[0].stderr).toBeTruthy();
    }
  });

  it("git's exit-1 diff report is still stdout and still redirects", async () => {
    const seeded = await run("git init && git add notes.txt && git commit -m init");
    const edited = seeded.fs.writeFile(`${HOME}/notes.txt`, "alpha\nBETA\ngamma\n").fs!;
    const r = await run("git diff > d.txt", edited);
    expect(r.fs.readFile(`${HOME}/d.txt`).content).toContain("BETA");
    expect(r.results[0].stderr).toBeUndefined();
  });

  it("dbt's not-a-project error stays out of the redirect target", async () => {
    const r = await run("dbt run > run.log");
    expect(r.fs.readFile(`${HOME}/run.log`).content).toBe("");
    expect(r.screen).toContain("Could not find dbt_project.yml");
  });

  it("snow's unknown-command error stays out of the redirect target", async () => {
    const r = await run("snow frobnicate > s.txt");
    expect(r.fs.readFile(`${HOME}/s.txt`).content).toBe("");
    expect(r.screen).toContain("snow: unknown command 'frobnicate'");
  });
});

describe("diff -r", () => {
  /** Two trees whose `b.txt` differs and whose `secret.txt` is unreadable. */
  function treesWithUnreadableChild(): VirtualFS {
    let fs = createTestFS();
    fs = fs.makeDirectory(`${HOME}/left`).fs!;
    fs = fs.makeDirectory(`${HOME}/right`).fs!;
    for (const [path, content] of [
      [`${HOME}/left/a.txt`, "same\n"],
      [`${HOME}/right/a.txt`, "same\n"],
      [`${HOME}/left/secret.txt`, "hidden\n"],
      [`${HOME}/right/secret.txt`, "hidden\n"],
    ] as const) {
      fs = fs.writeFile(path, content).fs!;
    }
    return fs.setPermissions(`${HOME}/left/secret.txt`, "---------").fs!;
  }

  it("keeps an unreadable child's error out of the pipe/redirect target", async () => {
    const r = await run("diff -r left right > out.diff", treesWithUnreadableChild());
    const content = r.fs.readFile(`${HOME}/out.diff`).content!;
    expect(content).not.toContain("Permission denied");
    expect(r.screen).toContain("Permission denied");
  });

  it("labels the recursive read error with the diff prefix", async () => {
    const r = await run("diff -r left right", treesWithUnreadableChild());
    expect(r.results[0].stderr).toBe(`diff: ${HOME}/left/secret.txt: Permission denied`);
  });
});

describe("stderr redirect tokens", () => {
  it("2>/dev/null silences the segment's stderr", async () => {
    const r = await run("cat nosuch.txt 2>/dev/null");
    expect(r.results[0].stderr).toBeUndefined();
    expect(r.screen).not.toContain("No such file");
    // The token is stripped, not passed to cat as a second file operand.
    expect(r.screen).not.toContain("2>/dev/null");
    expect(r.exitCode).toBe(1);
  });

  it("2>>/dev/null silences it too", async () => {
    const r = await run("cat nosuch.txt 2>>/dev/null");
    expect(r.results[0].stderr).toBeUndefined();
  });

  it("2>&1 folds stderr into stdout so it pipes and redirects", async () => {
    const r = await run("cat nosuch.txt 2>&1 > out.txt");
    expect(r.fs.readFile(`${HOME}/out.txt`).content).toContain("No such file or directory");
    expect(r.results[0].stderr).toBeUndefined();
  });

  it("a 2> token on a non-final pipeline stage is stripped, not treated as a file", async () => {
    const r = await run("cat nosuch.txt 2>/dev/null | wc -l");
    expect(r.screen).not.toContain("2>/dev/null");
    expect(r.results[0].output).toBe("       0");
    expect(r.results[0].stderr).toBeUndefined();
  });

  it("an unsupported 2>file form is rejected instead of silently dropped", async () => {
    const r = await run("cat notes.txt 2>err.log");
    expect(r.screen).toContain("only 2>/dev/null and 2>&1 are supported");
    expect(r.exitCode).toBe(1);
    // zsh opens redirects before exec, and this one never opened: nothing ran.
    expect(r.results).toHaveLength(0);
    expect(r.fs.getNode(`${HOME}/err.log`)).toBeNull();
  });
});

describe("bash scripts", () => {
  it("keeps a script's inner errors off stdout, so `bash s.sh > f` cannot capture them", async () => {
    const fs = createTestFS();
    const seeded = fs.writeFile(`${HOME}/s.sh`, "echo start\ncat nosuch.txt\necho end\n").fs!;
    const r = await run("bash s.sh > out.txt", seeded);
    expect(r.fs.readFile(`${HOME}/out.txt`).content).toBe("start\nend");
    expect(r.screen).toContain(`cat: ${HOME}/nosuch.txt: No such file or directory`);
  });

  it("command substitution captures stdout only", async () => {
    const fs = createTestFS();
    const seeded = fs.writeFile(`${HOME}/s.sh`, 'X=$(cat nosuch.txt)\necho "[$X]"\n').fs!;
    const r = await run("bash s.sh", seeded);
    expect(r.screen).toContain("[]");
    expect(r.screen).toContain(`cat: ${HOME}/nosuch.txt: No such file or directory`);
  });
});
