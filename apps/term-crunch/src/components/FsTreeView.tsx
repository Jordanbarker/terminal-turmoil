"use client";

import type { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { isDirectory, type FSNode } from "@tt/core/filesystem/types";

interface Props {
  fs: VirtualFS;
  /** Directory whose subtree is rendered. */
  watchPath: string;
  /** Absolute path of the node to flag as the deletion target (danger style). */
  dangerPath?: string;
}

function rows(node: FSNode, path: string, depth: number, dangerPath?: string): React.ReactElement[] {
  const indent = { paddingLeft: `${depth * 14}px` };
  const target = path === dangerPath;
  const label = isDirectory(node) ? `${node.name}/` : node.name;
  const typeChar = isDirectory(node) ? "d" : "-";
  const out: React.ReactElement[] = [
    // Keyed by full path: two same-named files in sibling directories would
    // collide on a depth+name key and React would reuse the wrong row.
    <div
      key={path}
      className="flex items-baseline gap-2 truncate"
      style={{ color: target ? "#ff7b72" : isDirectory(node) ? "#6cb6ff" : "#b3b1ad" }}
    >
      <span className="text-[#6b7680]">
        {typeChar}
        {node.permissions}
      </span>
      <span style={indent} className="truncate">
        {target ? "💣 " : ""}
        {label}
      </span>
    </div>,
  ];
  if (isDirectory(node)) {
    for (const child of Object.values(node.children).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push(...rows(child, `${path}/${child.name}`, depth + 1, dangerPath));
    }
  }
  return out;
}

/**
 * Prop-driven tree diagram of a filesystem subtree, shown for fs challenges.
 * Re-renders on every fs change, so removing the target file makes its row
 * disappear and the survivors stay put.
 */
export default function FsTreeView({ fs, watchPath, dangerPath }: Props) {
  const root = fs.getNode(watchPath);
  return (
    <div className="rounded border border-[#3d4751] bg-[#0a0e14] p-2 font-mono text-xs leading-relaxed">
      {root ? rows(root, watchPath, 0, dangerPath) : <div className="text-[#6b7680]">{watchPath} is gone</div>}
    </div>
  );
}
