import { DirectoryNode } from "../../engine/filesystem/types";
import { file, dir } from "../../engine/filesystem/builders";
import { buildDbtProject } from "./nexacorp";
import { StoryFlags } from "../../state/types";

export function createDevcontainerFilesystem(username: string, storyFlags?: StoryFlags): DirectoryNode {
  return dir("/", {
    home: dir("home", {
      [username]: dir(username, {
        ...(storyFlags?.dbt_project_cloned ? { "nexacorp-analytics": buildDbtProject() } : {}),
        "README.md": file("README.md", `=== Coder Dev Container ===

Workspace: ai
Provisioned by: Oscar Diaz (Infrastructure)

This is your remote development environment for data engineering work.
It has dbt, Snowflake CLI (snow), and Python pre-installed.

Getting started:
  1. Run 'git clone nexacorp/nexacorp-analytics'
  2. Run 'dbt build' to execute the full pipeline
  3. Use 'snow sql' to query the Snowflake warehouse directly

To return to your NexaCorp workstation, type 'exit'.
`),
      }),
    }),
  });
}
