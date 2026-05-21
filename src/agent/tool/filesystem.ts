import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import { Glob } from "bun";
import type { ToolResult } from "./types";

export interface FilesystemTool {
  read_file: (args: Record<string, unknown>) => Promise<ToolResult>;
  write_file: (args: Record<string, unknown>) => Promise<ToolResult>;
  list_dir: (args: Record<string, unknown>) => Promise<ToolResult>;
  find_files: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export const createFilesystemTool = (sandboxPaths: string[] = ["."]): FilesystemTool => {
  const resolvedPaths = sandboxPaths.map((p) => resolve(p));

  const validatePath = (requestedPath: string): string => {
    const resolved = isAbsolute(requestedPath)
      ? resolve(requestedPath)
      : resolve(process.cwd(), requestedPath);

    for (const sandbox of resolvedPaths) {
      if (resolved.startsWith(sandbox)) {
        return resolved;
      }
    }

    throw new Error(
      `Path outside sandbox: ${requestedPath} (sandbox: ${resolvedPaths.join(", ")})`,
    );
  };

  return {
    read_file: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const path = args.path as string;
      if (!path) {
        return { content: "Error: 'path' argument is required", isError: true };
      }

      try {
        const resolved = validatePath(path);
        const content = readFileSync(resolved, "utf-8");
        return { content };
      } catch (err) {
        return {
          content: `Error reading file: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },

    write_file: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const path = args.path as string;
      const content = args.content as string;

      if (!path) {
        return { content: "Error: 'path' argument is required", isError: true };
      }
      if (content === undefined || content === null) {
        return { content: "Error: 'content' argument is required", isError: true };
      }

      try {
        const resolved = validatePath(path);
        writeFileSync(resolved, content, "utf-8");
        return { content: `Wrote ${content.length} bytes to ${path}` };
      } catch (err) {
        return {
          content: `Error writing file: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },

    list_dir: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const path = args.path as string;
      const targetPath = path || ".";

      try {
        const resolved = validatePath(targetPath);
        const entries = readdirSync(resolved, { withFileTypes: true });
        const lines = entries.map((e) => {
          const icon = e.isDirectory() ? "📁" : e.isFile() ? "📄" : "🔗";
          return `${icon} ${e.name}`;
        });
        return { content: lines.join("\n") || "(empty directory)" };
      } catch (err) {
        return {
          content: `Error listing directory: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },

    find_files: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const pattern = args.pattern as string;
      const path = args.path as string;

      if (!pattern) {
        return { content: "Error: 'pattern' argument is required", isError: true };
      }

      try {
        const searchPath = path || ".";
        const resolved = validatePath(searchPath);
        const glob = new Glob(pattern);
        const results = Array.from(glob.scanSync({ cwd: resolved }));

        const filtered = results.filter((r) =>
          resolvedPaths.some((s) => r.startsWith(s)),
        );

        return {
          content:
            filtered.length > 0
              ? filtered.map((f) => relative(process.cwd(), f)).join("\n")
              : "(no matches)",
        };
      } catch (err) {
        return {
          content: `Error searching files: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  };
};
