import { describe, it, expect } from "vitest";
import { executeAsync } from "../registry";
import { CommandContext } from "../types";
import { BlockDevice, DeviceProvider } from "../devices";
import { SecurityPolicy, SecurityViolation } from "../security";
import { VirtualFS } from "../../filesystem/VirtualFS";
import { file, dir } from "../../filesystem/builders";
import "../builtins";

const HOME = "/home/player";
const PROTECTED = "/srv/leadership";

function createTestFS(): VirtualFS {
  const root = dir("/", {
    home: dir("home", {
      player: dir("player", {
        "wipe.sh": file("wipe.sh", `rm ${PROTECTED}/minutes.txt\n`, "rwxr-xr-x"),
        "tamper.sh": file("tamper.sh", "echo clean > /var/log/audit.log\n", "rwxr-xr-x"),
      }),
    }),
    srv: dir("srv", {
      leadership: dir("leadership", { "minutes.txt": file("minutes.txt", "board notes\n") }),
    }),
    var: dir("var", { log: dir("log", { "audit.log": file("audit.log", "entry\n") }) }),
    mnt: dir("mnt", { usb: dir("usb", {}) }),
  });
  return new VirtualFS(root, HOME, HOME);
}

/** Minimal policy: anything under /srv/leadership is protected, /var/log is tamperable. */
const policy: SecurityPolicy = {
  checkPathOp: (_fs, rootPath, opKind, opCtx): SecurityViolation | null =>
    rootPath.startsWith(PROTECTED)
      ? { kind: "leadership_destruction", path: rootPath, command: opCtx.command, descendantCount: 1 }
      : null,
  classifyChmodTarget: (path) => (path.startsWith(PROTECTED) ? "leadership_destruction" : null),
  isLogTamperPath: (path) => path.startsWith("/var/log/"),
};

function ctx(overrides?: Partial<CommandContext>): CommandContext {
  const fs = createTestFS();
  return {
    fs,
    cwd: HOME,
    homeDir: HOME,
    username: "player",
    activeComputer: "nexacorp",
    security: policy,
    ...overrides,
  };
}

describe("bash scripts surface security violations", () => {
  it("rm of a protected path inside a script reaches the caller", async () => {
    const result = await executeAsync("bash", ["wipe.sh"], {}, ctx());
    expect(result.securityViolation).toBeDefined();
    expect(result.securityViolation!.kind).toBe("leadership_destruction");
    expect(result.securityViolation!.path).toBe(`${PROTECTED}/minutes.txt`);
  });

  it("bash -c raises the same violation", async () => {
    const result = await executeAsync("bash", [`rm ${PROTECTED}/minutes.txt`], { c: true }, ctx());
    expect(result.securityViolation?.kind).toBe("leadership_destruction");
  });

  it("a redirect log-tamper inside a script reaches the caller", async () => {
    const result = await executeAsync("bash", ["tamper.sh"], {}, ctx());
    expect(result.securityViolation?.kind).toBe("log_tampering");
    expect(result.securityViolation?.path).toBe("/var/log/audit.log");
  });

  it("an innocuous script reports no violation", async () => {
    const result = await executeAsync("bash", ["echo hello"], { c: true }, ctx());
    expect(result.securityViolation).toBeUndefined();
    expect(result.output).toBe("hello");
  });
});

// The real `mount` builtin driven through the injectable DeviceProvider seam,
// so no test-only command is added to the shared registry.
const USB: BlockDevice = {
  name: "sdb1", devicePath: "/dev/sdb1", major: 8, minor: 17,
  removable: true, size: "8G", readOnly: false, type: "part", fstype: "vfat",
};
const devices: DeviceProvider = {
  visibleDevices: () => [USB],
  rootDevice: () => undefined,
  findDevice: (q) => (q === "/dev/sdb1" || q === "sdb1" ? USB : undefined),
};

describe("bash scripts thread mount changes back out", () => {
  it("newMounts set inside a script is propagated out of the subshell", async () => {
    const result = await executeAsync(
      "bash", ["mount /dev/sdb1 /mnt/usb"], { c: true }, ctx({ mounts: {}, devices }),
    );
    expect(result.newMounts).toEqual({
      "/mnt/usb": { device: "/dev/sdb1", mountpath: "/mnt/usb", fstype: "vfat" },
    });
  });

  it("a script that mounts nothing reports no mount change", async () => {
    const result = await executeAsync("bash", ["echo noop"], { c: true }, ctx({ mounts: {}, devices }));
    expect(result.newMounts).toBeUndefined();
  });
});
