import { DirectoryNode, FileNode } from "../../engine/filesystem/types";

function file(name: string, content: string, permissions = "rw-r--r--"): FileNode {
  return { type: "file", name, content, permissions, hidden: name.startsWith(".") };
}

function dir(name: string, children: Record<string, DirectoryNode | FileNode>, permissions = "rwxr-xr-x"): DirectoryNode {
  return { type: "directory", name, children, permissions, hidden: name.startsWith(".") };
}

export function createDevcontainerFilesystem(username: string): DirectoryNode {
  return dir("/", {
    home: dir("home", {
      [username]: dir(username, {
        "README.md": file("README.md", `=== Coder Dev Container ===

Workspace: ai
Provisioned by: Oscar Diaz (Infrastructure)

This is your remote development environment for data engineering work.
It has dbt, Snowflake (snowsql), and Python pre-installed.

Getting started:
  1. Use 'chip' to clone the analytics repo
  2. Run 'dbt build' to execute the full pipeline
  3. Use 'snowsql' to query the Snowflake warehouse directly

To return to your NexaCorp workstation, type 'exit'.
`),
      }),
    }),
  });
}
