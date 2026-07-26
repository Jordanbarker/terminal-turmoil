import { describe, it, expect, beforeEach } from "vitest";
import "@tt/core/commands/builtins"; // register builtins so the registry is populated
import { parseTmuxPrefix, parseTmuxBindings } from "@tt/core/terminal/tmuxConfig";
import { resetStore } from "./helpers";
import { useGameStore } from "../state/gameStore";
import { HOME_DIR } from "../lib/machine";
import { DEFAULT_ZSHRC, DEFAULT_TMUX_CONF } from "../lib/defaultConfigs";
import { registryIndex } from "../challenges/categories";

const ZSHRC_PATH = `${HOME_DIR}/.zshrc`;
const TMUX_PATH = `${HOME_DIR}/.tmux.conf`;

describe("settings: dotfiles seeded into each challenge fs", () => {
  beforeEach(() => {
    resetStore();
    useGameStore.getState().loadChallenge(0);
  });

  it("writes ~/.zshrc and ~/.tmux.conf into the fs and activates the zshrc", () => {
    const s = useGameStore.getState();
    expect(s.fs.readFile(ZSHRC_PATH).content).toBe(DEFAULT_ZSHRC);
    expect(s.fs.readFile(TMUX_PATH).content).toBe(DEFAULT_TMUX_CONF);
    // zshrc aliases + exports are parsed into the live session.
    expect(s.aliases.gs).toBe("git status");
    expect(s.aliases.ll).toBe("ls -lh");
    expect(s.aliases[".."]).toBe("cd ..");
    expect(s.envVars.EDITOR).toBe("nano");
  });

  it("re-seeds the dotfiles after a subsequent loadChallenge", () => {
    useGameStore.getState().loadChallenge(1);
    const s = useGameStore.getState();
    expect(s.fs.readFile(ZSHRC_PATH).content).toBe(DEFAULT_ZSHRC);
    expect(s.fs.readFile(TMUX_PATH).content).toBe(DEFAULT_TMUX_CONF);
  });
});

describe("settings: setConfigs applies live and persists across challenges", () => {
  beforeEach(() => {
    resetStore();
    useGameStore.getState().loadChallenge(0);
  });

  it("updates the fs + re-derives aliases/env without a challenge reset", () => {
    const customZ = "alias gp='git push'\nexport PAGER=less\n";
    const customT = "set -g prefix C-a\n";
    useGameStore.getState().setConfigs(customZ, customT);

    const s = useGameStore.getState();
    expect(s.zshrc).toBe(customZ);
    expect(s.fs.readFile(ZSHRC_PATH).content).toBe(customZ);
    expect(s.fs.readFile(TMUX_PATH).content).toBe(customT);
    expect(s.aliases.gp).toBe("git push");
    expect(s.aliases.gs).toBeUndefined(); // old default alias dropped
    expect(s.envVars.PAGER).toBe("less");
  });

  it("carries saved configs into the next challenge's fresh fs", () => {
    const customZ = "alias gp='git push'\n";
    const customT = "set -g prefix C-b\n";
    useGameStore.getState().setConfigs(customZ, customT);
    useGameStore.getState().loadChallenge(1);

    const s = useGameStore.getState();
    expect(s.fs.readFile(ZSHRC_PATH).content).toBe(customZ);
    expect(s.fs.readFile(TMUX_PATH).content).toBe(customT);
    expect(s.aliases.gp).toBe("git push");
  });

  it("mid-challenge settings save keeps an exported var and a defined alias", () => {
    // The player's live session is theirs: only keys the OUTGOING zshrc owned
    // are replaced by the new one.
    useGameStore.setState({
      envVars: { ...useGameStore.getState().envVars, API_TOKEN: "abc123" },
      aliases: { ...useGameStore.getState().aliases, deploy: "./deploy.sh" },
    });
    useGameStore.getState().setConfigs("export PAGER=less\n", DEFAULT_TMUX_CONF);

    const s = useGameStore.getState();
    expect(s.envVars.API_TOKEN).toBe("abc123"); // player export survives
    expect(s.aliases.deploy).toBe("./deploy.sh"); // player alias survives
    expect(s.envVars.PAGER).toBe("less"); // new zshrc applied
    expect(s.envVars.EDITOR).toBeUndefined(); // old zshrc's key surrendered
    expect(s.aliases.gs).toBeUndefined();
  });

  it("does not revert a player's unset of a challenge-seeded var", () => {
    // env-export seeds SAFEGUARDS=on and asks the player to unset it. A
    // Settings save must not re-seed it (initialEnv applies at load only).
    const state = useGameStore.getState;
    state().loadChallenge(registryIndex("env-export"));
    expect(state().envVars.SAFEGUARDS).toBe("on"); // seeded at load
    const { SAFEGUARDS: _, ...rest } = state().envVars;
    useGameStore.setState({ envVars: rest });

    state().setConfigs(DEFAULT_ZSHRC, DEFAULT_TMUX_CONF);

    expect("SAFEGUARDS" in useGameStore.getState().envVars).toBe(false);
  });

  it("an alias challenge can't complete via a route where the alias never existed", () => {
    // setConfigs runs checkCompletion, so a Settings save is a real advance
    // route. alias-shortcut's final step ("ship is gone") is vacuously true at
    // load — only the cascade's step 0 (ship EXISTS) keeps it out of reach.
    const state = useGameStore.getState;
    state().loadChallenge(registryIndex("alias-shortcut"));
    // Satisfy step 1 (the release dir) without ever defining the alias.
    const mk = state().fs.makeDirectory("/home/player/releases/v2");
    if (!mk.fs) throw new Error(mk.error ?? "seed releases/v2 failed");
    state().setFs(mk.fs);

    state().setConfigs("export PAGER=less\n", DEFAULT_TMUX_CONF);

    const s = useGameStore.getState();
    expect(s.stepIndex).toBe(0);
    expect(s.awaitingContinue).toBe(false);
    expect(s.completed).toBe(false);
  });

  it("resetConfigs restores the defaults", () => {
    useGameStore.getState().setConfigs("alias x='y'\n", "set -g prefix C-x\n");
    useGameStore.getState().resetConfigs();
    const s = useGameStore.getState();
    expect(s.zshrc).toBe(DEFAULT_ZSHRC);
    expect(s.tmuxConf).toBe(DEFAULT_TMUX_CONF);
  });
});

describe("settings: default tmux.conf parses to the expected prefix + binds", () => {
  it("keeps Ctrl+Space as the prefix and ships vim focus/resize binds", () => {
    expect(parseTmuxPrefix(DEFAULT_TMUX_CONF)).toEqual({ char: "\x00", label: "Ctrl+Space" });

    const binds = parseTmuxBindings(DEFAULT_TMUX_CONF);
    expect(binds.h).toEqual({ kind: "focus", dir: "L" });
    expect(binds.l).toEqual({ kind: "focus", dir: "R" });
    expect(binds.H).toEqual({ kind: "resize", dir: "L", cells: 5, repeat: true });
    expect(binds.J).toEqual({ kind: "resize", dir: "D", cells: 5, repeat: true });
  });
});
