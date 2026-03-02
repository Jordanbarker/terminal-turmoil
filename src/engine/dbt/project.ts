import { VirtualFS } from "../filesystem/VirtualFS";
import { isFile, isDirectory } from "../filesystem/types";
import { DbtProjectConfig, DbtResource } from "./types";

/**
 * Walk up from cwd looking for dbt_project.yml.
 * Returns the project root path, or null if not found.
 */
export function findDbtProject(fs: VirtualFS, cwd: string): string | null {
  let dir = cwd;
  while (true) {
    const node = fs.getNode(dir + "/dbt_project.yml");
    if (node && isFile(node)) return dir;
    if (dir === "/") return null;
    const lastSlash = dir.lastIndexOf("/");
    dir = lastSlash === 0 ? "/" : dir.slice(0, lastSlash);
  }
}

/**
 * Parse a dbt_project.yml file content using simple string matching.
 * No YAML parser — just regex for the fields we care about.
 */
export function parseProjectConfig(content: string): DbtProjectConfig {
  const name = content.match(/^name:\s*['"]?([^'"\n]+)['"]?/m)?.[1]?.trim() ?? "unknown";
  const version = content.match(/^version:\s*['"]?([^'"\n]+)['"]?/m)?.[1]?.trim() ?? "0.0.0";
  const profile = content.match(/^profile:\s*['"]?([^'"\n]+)['"]?/m)?.[1]?.trim() ?? "default";

  const modelPathsMatch = content.match(/^model-paths:\s*\[([^\]]*)\]/m);
  let modelPaths = ["models"];
  if (modelPathsMatch) {
    modelPaths = modelPathsMatch[1]
      .split(",")
      .map((p) => p.trim().replace(/['"]/g, ""))
      .filter(Boolean);
  }

  return { name, version, profile, modelPaths };
}

/**
 * Recursively discover .sql model files under the model paths.
 * Returns model names in dependency order (staging → intermediate → marts).
 */
export function discoverModels(
  fs: VirtualFS,
  projectRoot: string,
  config: DbtProjectConfig
): string[] {
  const models: string[] = [];

  for (const modelPath of config.modelPaths) {
    const fullPath = projectRoot + "/" + modelPath;
    walkForSql(fs, fullPath, models);
  }

  return models;
}

function walkForSql(fs: VirtualFS, dirPath: string, models: string[]): void {
  const node = fs.getNode(dirPath);
  if (!node || !isDirectory(node)) return;

  // Sort children for deterministic order
  const entries = Object.entries(node.children).sort(([a], [b]) => a.localeCompare(b));

  // Process files first, then directories (so staging files come before subdirectory models)
  const files = entries.filter(([, n]) => isFile(n));
  const dirs = entries.filter(([, n]) => isDirectory(n));

  for (const [name] of files) {
    if (name.endsWith(".sql")) {
      models.push(name.replace(/\.sql$/, ""));
    }
  }

  for (const [name] of dirs) {
    walkForSql(fs, dirPath + "/" + name, models);
  }
}

/**
 * Discover all resources (models, tests, sources) for `dbt ls`.
 */
export function discoverResources(
  fs: VirtualFS,
  projectRoot: string,
  config: DbtProjectConfig
): DbtResource[] {
  const resources: DbtResource[] = [];

  // Models
  for (const modelPath of config.modelPaths) {
    const fullPath = projectRoot + "/" + modelPath;
    walkForResources(fs, fullPath, modelPath, resources);
  }

  // Tests
  const testsPath = projectRoot + "/tests";
  const testsNode = fs.getNode(testsPath);
  if (testsNode && isDirectory(testsNode)) {
    for (const [name] of Object.entries(testsNode.children).sort(([a], [b]) => a.localeCompare(b))) {
      if (name.endsWith(".sql")) {
        resources.push({
          name: name.replace(/\.sql$/, ""),
          type: "test",
          path: "tests/" + name,
        });
      }
    }
  }

  // Sources (from _staging__sources.yml or _sources.yml)
  for (const modelPath of config.modelPaths) {
    for (const sourcesFile of ["_staging__sources.yml", "_sources.yml"]) {
      const sourcesPath = projectRoot + "/" + modelPath + "/staging/" + sourcesFile;
      const sourcesNode = fs.getNode(sourcesPath);
      if (sourcesNode && isFile(sourcesNode)) {
        const sourceNames = sourcesNode.content.match(/- name:\s*(\S+)/g);
        if (sourceNames) {
          for (const match of sourceNames) {
            const name = match.replace(/- name:\s*/, "");
            resources.push({ name, type: "source" });
          }
        }
        break; // only use the first one found
      }
    }
  }

  // Seeds (from seeds/ directory)
  const seedsPath = projectRoot + "/seeds";
  const seedsNode = fs.getNode(seedsPath);
  if (seedsNode && isDirectory(seedsNode)) {
    for (const [name] of Object.entries(seedsNode.children).sort(([a], [b]) => a.localeCompare(b))) {
      if (name.endsWith(".csv")) {
        resources.push({
          name: name.replace(/\.csv$/, ""),
          type: "seed",
          path: "seeds/" + name,
        });
      }
    }
  }

  return resources;
}

function walkForResources(
  fs: VirtualFS,
  dirPath: string,
  relativePath: string,
  resources: DbtResource[]
): void {
  const node = fs.getNode(dirPath);
  if (!node || !isDirectory(node)) return;

  const entries = Object.entries(node.children).sort(([a], [b]) => a.localeCompare(b));

  for (const [name, child] of entries) {
    if (isFile(child) && name.endsWith(".sql")) {
      resources.push({
        name: name.replace(/\.sql$/, ""),
        type: "model",
        path: relativePath + "/" + name,
      });
    } else if (isDirectory(child)) {
      walkForResources(fs, dirPath + "/" + name, relativePath + "/" + name, resources);
    }
  }
}
