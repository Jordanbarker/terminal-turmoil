import { describe, it, expect } from "vitest";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { execute } from "@tt/core/commands/registry";
import { createHomeFilesystem } from "../../../story/filesystem/home";
import { getHomeEmailDefinitions } from "../../../story/emails/home";
import { deliverEmail, getMailEntries } from "../mailUtils";
import "../../commands/builtins";

const USERNAME = "testplayer";

/**
 * The three termination variants share a subject line and a sender, so header
 * matching resolved every one of them to the first definition: reading the
 * exfiltration notice emitted `file_read` for the log-tampering email. The
 * maildir filename carries the id, so identity comes from there.
 */
const VARIANTS = [
  "termination_log_tampering",
  "termination_leadership_destruction",
  "termination_exfiltration",
] as const;

function homeFs(): VirtualFS {
  return new VirtualFS(createHomeFilesystem(USERNAME), `/home/${USERNAME}`, `/home/${USERNAME}`);
}

function ctx(fs: VirtualFS) {
  return { fs, cwd: fs.cwd, homeDir: fs.homeDir, username: USERNAME, activeComputer: "home" as const };
}

describe("termination email identity", () => {
  it("all three variants really do share subject and sender", () => {
    const defs = getHomeEmailDefinitions(USERNAME);
    const found = VARIANTS.map((id) => defs.find((d) => d.email.id === id)!.email);
    expect(found).toHaveLength(3);
    expect(new Set(found.map((e) => e.subject)).size).toBe(1);
    expect(new Set(found.map((e) => e.from)).size).toBe(1);
  });

  for (const id of VARIANTS) {
    it(`reading ${id} emits file_read for that id`, () => {
      const def = getHomeEmailDefinitions(USERNAME).find((d) => d.email.id === id)!;
      let fs = homeFs();
      const seq = Math.max(0, ...getMailEntries(fs).map((e) => e.seq)) + 1;
      fs = deliverEmail(fs, def.email, seq).fs;

      const index = getMailEntries(fs).findIndex((e) => e.slug === id) + 1;
      expect(index).toBeGreaterThan(0);

      const result = execute("mail", [String(index)], {}, ctx(fs));
      expect(result.triggerEvents).toEqual([{ type: "file_read", detail: id }]);
    });
  }
});
