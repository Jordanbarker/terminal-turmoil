import { FSNode, DirectoryNode, FileNode, isDirectory, isFile } from "./types";
import { normalizePath, resolvePath, parentPath, basename } from "@tt/core/lib/pathUtils";

/**
 * Returns true if the given FSNode is a binary file.
 */
export function isBinaryFile(node: FSNode | null | undefined): boolean {
  return !!(node && node.type === "file" && node.metadata?.binary);
}

type PermissionOp = "read" | "write" | "execute";

function checkPermission(permissions: string, op: PermissionOp): boolean {
  // Check "other" bits at positions 6, 7, 8
  switch (op) {
    case "read":    return permissions[6] === "r";
    case "write":   return permissions[7] === "w";
    case "execute": return permissions[8] === "x";
  }
}

/**
 * Writes are gated on the OWNER write bit, not the "other" bit reads use: the
 * player owns the files they edit, so `rw-r--r--` stays writable while
 * `chmod 400` (`r--------`) does not. Same convention as the editors' readOnly
 * check and the registry's `perms[2] !== "x"` exec check.
 */
function isWritable(permissions: string): boolean {
  return permissions[1] === "w";
}

/**
 * Immutable virtual filesystem. Every mutation returns a new VirtualFS instance.
 */
export class VirtualFS {
  constructor(
    public readonly root: DirectoryNode,
    public readonly cwd: string = "/home/player",
    public readonly homeDir: string = "/home/player"
  ) {}

  /**
   * Resolve a user-provided path against cwd.
   */
  resolve(input: string): string {
    return resolvePath(input, this.cwd, this.homeDir);
  }

  /**
   * Get a node at the given absolute path.
   */
  getNode(absolutePath: string): FSNode | null {
    const normalized = normalizePath(absolutePath);
    if (normalized === "/") return this.root;

    const parts = normalized.split("/").filter(Boolean);
    let current: FSNode = this.root;

    for (const part of parts) {
      if (!isDirectory(current)) return null;
      const child: FSNode | undefined = current.children[part];
      if (!child) return null;
      current = child;
    }

    return current;
  }

  /**
   * Walk the path and check execute permission on each parent directory.
   * Returns null if OK, error string if denied.
   */
  checkTraversal(absolutePath: string): string | null {
    const normalized = normalizePath(absolutePath);
    if (normalized === "/") return null;

    const parts = normalized.split("/").filter(Boolean);
    let current: FSNode = this.root;

    // Check execute permission on each parent directory (excluding the final component)
    for (let i = 0; i < parts.length - 1; i++) {
      if (!isDirectory(current)) return null;
      const child: FSNode | undefined = current.children[parts[i]];
      if (!child) return null;
      if (isDirectory(child) && !checkPermission(child.permissions, "execute")) {
        const denied = "/" + parts.slice(0, i + 1).join("/");
        return `Permission denied: ${denied}`;
      }
      current = child;
    }

    return null;
  }

  /**
   * List directory contents at the given path.
   */
  listDirectory(absolutePath: string): { entries: FSNode[]; error?: string } {
    const node = this.getNode(absolutePath);
    if (!node) return { entries: [], error: `ls: cannot access '${absolutePath}': No such file or directory` };
    if (!isDirectory(node)) return { entries: [], error: `ls: '${absolutePath}': Not a directory` };

    const traversalError = this.checkTraversal(absolutePath);
    if (traversalError) return { entries: [], error: traversalError };
    if (!checkPermission(node.permissions, "read")) {
      return { entries: [], error: `Permission denied: ${absolutePath}` };
    }

    return { entries: Object.values(node.children) };
  }

  /**
   * Read file contents at the given path.
   */
  readFile(absolutePath: string): { content?: string; error?: string } {
    const node = this.getNode(absolutePath);
    if (!node) return { error: `cat: ${absolutePath}: No such file or directory` };
    if (!isFile(node)) return { error: `cat: ${absolutePath}: Is a directory` };

    const traversalError = this.checkTraversal(absolutePath);
    if (traversalError) return { error: traversalError };
    if (!checkPermission(node.permissions, "read")) {
      return { error: `Permission denied: ${absolutePath}` };
    }

    return { content: node.content };
  }

  /**
   * Would `writeFile` refuse this path? Returns the error it would produce, or
   * null. Exists so redirection can reject a bad target BEFORE the command runs
   * (zsh opens redirect files before exec) without the two checks drifting.
   */
  canWriteFile(absolutePath: string): string | null {
    const normalized = normalizePath(absolutePath);
    const parent = parentPath(normalized);

    const parentNode = this.getNode(parent);
    if (!parentNode || !isDirectory(parentNode)) {
      return `Cannot write to '${absolutePath}': parent directory does not exist`;
    }

    const existing = this.getNode(normalized);
    if (existing && isDirectory(existing)) {
      return `Cannot write to '${absolutePath}': Is a directory`;
    }

    const traversalError = this.checkTraversal(absolutePath);
    if (traversalError) return traversalError;

    if (existing && isFile(existing) && !isWritable(existing.permissions)) {
      return `Permission denied: ${absolutePath}`;
    }

    return null;
  }

  /**
   * Return a new VirtualFS with the file written/updated at the given path.
   *
   * Attribute rules, which differ on purpose:
   * - **permissions** describe the FILE, so an overwrite keeps the existing
   *   node's mode (a `chmod`ed file stays chmoded through a rewrite); a new
   *   file takes `template`'s mode, else the 644 default.
   * - **metadata** describes the CONTENT (`binary`, extracted `textContent`),
   *   so replacing the content always replaces the metadata. It comes from
   *   `template` (the node the new bytes came from) or is dropped — never
   *   inherited from the bytes that were just overwritten, or `echo x > a.pdf`
   *   would leave `cat`/`pdftotext` reporting the old document.
   *
   * `template` is how `cp`/`mv` carry a source file's mode and metadata onto a
   * destination they are creating.
   */
  writeFile(absolutePath: string, content: string, template?: FileNode): { fs?: VirtualFS; error?: string } {
    const normalized = normalizePath(absolutePath);
    const name = basename(normalized);

    const error = this.canWriteFile(absolutePath);
    if (error) return { error };

    const existing = this.getNode(normalized);
    const overwriting = existing && isFile(existing) ? existing : undefined;
    const metadata = template?.metadata;

    const newFile: FileNode = {
      type: "file",
      name,
      content,
      permissions: overwriting?.permissions ?? template?.permissions ?? "rw-r--r--",
      hidden: name.startsWith("."),
      ...(metadata !== undefined && { metadata }),
    };

    const newRoot = this.setNodeAt(normalized, newFile);
    return { fs: new VirtualFS(newRoot, this.cwd, this.homeDir) };
  }

  /**
   * Return a new VirtualFS with a new directory at the given path.
   */
  makeDirectory(absolutePath: string): { fs?: VirtualFS; error?: string } {
    const normalized = normalizePath(absolutePath);
    const parent = parentPath(normalized);
    const name = basename(normalized);

    const parentNode = this.getNode(parent);
    if (!parentNode || !isDirectory(parentNode)) {
      return { error: `mkdir: cannot create directory '${absolutePath}': No such file or directory` };
    }

    if (this.getNode(normalized)) {
      return { error: `mkdir: cannot create directory '${absolutePath}': File exists` };
    }

    const traversalError = this.checkTraversal(absolutePath);
    if (traversalError) return { error: traversalError };

    const newDir: DirectoryNode = {
      type: "directory",
      name,
      children: {},
      permissions: "rwxr-xr-x",
      hidden: name.startsWith("."),
    };

    const newRoot = this.setNodeAt(normalized, newDir);
    return { fs: new VirtualFS(newRoot, this.cwd, this.homeDir) };
  }

  /**
   * Return a new VirtualFS with the node at the given path removed.
   */
  removeNode(absolutePath: string): { fs?: VirtualFS; error?: string } {
    const normalized = normalizePath(absolutePath);
    if (normalized === "/") return { error: "Cannot remove root directory" };

    const node = this.getNode(normalized);
    if (!node) return { error: `rm: cannot remove '${absolutePath}': No such file or directory` };

    const parent = parentPath(normalized);
    const name = basename(normalized);
    const parentNode = this.getNode(parent);
    if (!parentNode || !isDirectory(parentNode)) return { error: "Internal error" };

    const traversalError = this.checkTraversal(absolutePath);
    if (traversalError) return { error: traversalError };

    const newChildren = { ...parentNode.children };
    delete newChildren[name];

    const newParent: DirectoryNode = { ...parentNode, children: newChildren };
    const newRoot = parent === "/"
      ? newParent as DirectoryNode
      : this.setNodeAt(parent, newParent);

    return { fs: new VirtualFS(newRoot, this.cwd, this.homeDir) };
  }

  /**
   * Return a new VirtualFS with the permissions changed on the node at the given path.
   */
  setPermissions(absolutePath: string, permissions: string): { fs?: VirtualFS; error?: string } {
    const normalized = normalizePath(absolutePath);
    const node = this.getNode(normalized);
    if (!node) return { error: `chmod: cannot access '${absolutePath}': No such file or directory` };

    const traversalError = this.checkTraversal(absolutePath);
    if (traversalError) return { error: traversalError };

    const updated = { ...node, permissions };
    const newRoot = this.setNodeAt(normalized, updated);
    return { fs: new VirtualFS(newRoot, this.cwd, this.homeDir) };
  }

  /**
   * Return a new VirtualFS with cwd changed to the given path.
   */
  changeCwd(absolutePath: string): { fs?: VirtualFS; error?: string } {
    const normalized = normalizePath(absolutePath);
    const node = this.getNode(normalized);
    if (!node) return { error: `cd: ${absolutePath}: No such file or directory` };
    if (!isDirectory(node)) return { error: `cd: ${absolutePath}: Not a directory` };

    const traversalError = this.checkTraversal(absolutePath);
    if (traversalError) return { error: traversalError };
    if (!checkPermission(node.permissions, "execute")) {
      return { error: `cd: ${absolutePath}: Permission denied` };
    }

    return { fs: new VirtualFS(this.root, normalized, this.homeDir) };
  }

  /**
   * Insert an entire FSNode subtree at the given absolute path.
   * Parent directory must exist.
   *
   * Privileged/seed-time API: it deliberately skips the traversal and mode
   * checks the user-facing mutators run. It DOES rename the inserted node to
   * the path's basename so the `children[key] === node.name` invariant holds
   * (callers never have to pre-rename for a move/rename).
   */
  insertNode(absolutePath: string, node: FSNode): { fs?: VirtualFS; error?: string } {
    const normalized = normalizePath(absolutePath);
    const parent = parentPath(normalized);

    const parentNode = this.getNode(parent);
    if (!parentNode || !isDirectory(parentNode)) {
      return { error: `Cannot insert at '${absolutePath}': parent directory does not exist` };
    }

    const name = basename(normalized);
    const named: FSNode = node.name === name ? node : { ...node, name };
    const newRoot = this.setNodeAt(normalized, named);
    return { fs: new VirtualFS(newRoot, this.cwd, this.homeDir) };
  }

  /**
   * Deep-clone and set a node at the given absolute path, returning a new root.
   */
  private setNodeAt(absolutePath: string, node: FSNode): DirectoryNode {
    const normalized = normalizePath(absolutePath);
    if (normalized === "/") return node as DirectoryNode;

    const parts = normalized.split("/").filter(Boolean);
    return this.setNodeRecursive(this.root, parts, 0, node);
  }

  private setNodeRecursive(
    dir: DirectoryNode,
    parts: string[],
    index: number,
    node: FSNode
  ): DirectoryNode {
    const part = parts[index];

    if (index === parts.length - 1) {
      return {
        ...dir,
        children: { ...dir.children, [part]: node },
      };
    }

    const child = dir.children[part];
    if (!child || !isDirectory(child)) {
      throw new Error(`Path segment '${part}' is not a directory`);
    }

    return {
      ...dir,
      children: {
        ...dir.children,
        [part]: this.setNodeRecursive(child, parts, index + 1, node),
      },
    };
  }
}
