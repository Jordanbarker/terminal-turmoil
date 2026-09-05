import { CommandHandler } from "@tt/core/commands/types";
import { register } from "../registry";
import { setKnownFlags } from "../flagValidation";
import { HELP_TEXTS } from "./helpTexts";
import { Mount, normalizeMountKey } from "@tt/core/filesystem/mounts";
import { dir } from "@tt/core/filesystem/builders";
import { isDirectory } from "@tt/core/filesystem/types";
import { basename } from "@tt/core/lib/pathUtils";
import { errorResult } from "../fsErrors";

const mount: CommandHandler = (args, _flags, ctx) => {
  const mounts = ctx.mounts ?? {};

  if (args.length === 0) {
    const lines = Object.values(mounts).map((m) =>
      `${m.device} on ${m.mountpath} type ${m.fstype ?? "auto"} (rw,relatime)`
    );
    return { output: lines.join("\n") };
  }

  if (args.length !== 2) {
    return errorResult("mount: bad usage\nTry 'mount --help' for more information.", 1);
  }

  const [deviceArg, pathArg] = args;
  const device = ctx.devices?.findDevice(deviceArg);
  if (!device) {
    return errorResult(`mount: ${deviceArg}: no such device`, 1);
  }
  if (device.mountpoint) {
    return errorResult(`mount: ${device.devicePath} already mounted on ${device.mountpoint}`, 1);
  }

  const mountpath = normalizeMountKey(pathArg, ctx.cwd, ctx.homeDir);
  if (mountpath === "/") {
    return errorResult(`mount: /: cannot mount on root`, 1);
  }

  const target = ctx.fs.getNode(mountpath);
  if (!target) {
    return errorResult(`mount: ${pathArg}: mount point does not exist`, 1);
  }
  if (!isDirectory(target)) {
    return errorResult(`mount: ${pathArg}: mount point is not a directory`, 1);
  }
  if (Object.keys(target.children).length > 0) {
    return errorResult(`mount: ${pathArg}: not mounting — directory is not empty`, 1);
  }
  if (mounts[mountpath]) {
    return errorResult(`mount: ${pathArg}: already mounted`, 1);
  }

  const overlay = dir(basename(mountpath), device.getContents?.() ?? {});
  const insertResult = ctx.fs.insertNode(mountpath, overlay);
  if (insertResult.error || !insertResult.fs) {
    return errorResult(`mount: ${insertResult.error ?? "failed"}`, 1);
  }

  const newMount: Mount = { device: device.devicePath, mountpath, fstype: device.fstype };
  const newMounts = { ...mounts, [mountpath]: newMount };

  // App-defined story trigger: a device may credit being mounted at a
  // specific path (see BlockDevice.mountTrigger). Other mounts don't.
  const trig = device.mountTrigger;

  return {
    output: "",
    newFs: insertResult.fs,
    newMounts,
    triggerEvents: trig && trig.mountpath === mountpath ? [trig.event] : undefined,
  };
};

register("mount", mount, "Mount a filesystem", HELP_TEXTS.mount);
setKnownFlags("mount", {});
