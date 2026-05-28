import type { ToolDefinition, ToolHandler, ToolResult } from "./types";
import type { PermissionsConfig } from "../../config/types";
import { createFilesystemTool, type FilesystemToolOptions } from "./filesystem";
import {
  loadCustomTools,
  checkToolMtimes,
  type LoadedTool,
} from "./custom-tools";
import type { ToolContextOptions } from "./context";

export interface ToolRegistry {
  register: (name: string, handler: ToolHandler, definition: ToolDefinition) => void;
  getDefinition: (name: string) => ToolDefinition | undefined;
  getDefinitions: () => ToolDefinition[];
  execute: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  list: () => string[];
  getDeniedTools: () => string[];
}

export interface ToolApprovalCallback {
  (name: string, definition: ToolDefinition): Promise<"approved" | "denied">;
}

export const createToolRegistry = (
  permissions: PermissionsConfig = {},
  onToolPending?: ToolApprovalCallback,
): ToolRegistry => {
  const tools = new Map<string, { handler: ToolHandler; definition: ToolDefinition }>();
  const deniedLog: string[] = [];

  const isToolApproved = (name: string): boolean => {
    const toolPerms = permissions.tools?.[name];
    if (!toolPerms) return false;
    if (toolPerms.state === "denied") return false;
    if (toolPerms.state === "approved") return true;
    return false;
  };

  return {
    register: (name: string, handler: ToolHandler, definition: ToolDefinition): void => {
      tools.set(name, { handler, definition });
    },

    getDefinition: (name: string): ToolDefinition | undefined => {
      return tools.get(name)?.definition;
    },

    getDefinitions: (): ToolDefinition[] => {
      return Array.from(tools.entries())
        .filter(([name]) => isToolApproved(name))
        .map(([, t]) => t.definition);
    },

    execute: async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
      const tool = tools.get(name);
      if (!tool) {
        return { content: `Unknown tool: ${name}`, isError: true };
      }

      if (isToolApproved(name)) {
        try {
          return await tool.handler(args);
        } catch (err) {
          return {
            content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
          };
        }
      }

      const toolPerms = permissions.tools?.[name];
      if (toolPerms?.state === "denied") {
        deniedLog.push(name);
        return {
          content: `Tool '${name}' is not approved for use.`,
          isError: true,
        };
      }

      if (onToolPending) {
        const decision = await onToolPending(name, tool.definition);
        if (decision === "approved") {
          try {
            return await tool.handler(args);
          } catch (err) {
            return {
              content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
              isError: true,
            };
          }
        }
        deniedLog.push(name);
        return {
          content: `Tool '${name}' was not approved for use.`,
          isError: true,
        };
      }

      deniedLog.push(name);
      return {
        content: `Tool '${name}' requires approval before use.`,
        isError: true,
      };
    },

    list: (): string[] => {
      return Array.from(tools.keys()).filter((name) => isToolApproved(name));
    },

    getDeniedTools: (): string[] => {
      return deniedLog;
    },
  };
};

export interface DefaultRegistryOptions {
  sandboxPaths?: string[];
  permissions?: PermissionsConfig;
  onToolPending?: ToolApprovalCallback;
  onSensitivePath?: (path: string, reason: string) => void;
  customToolsDirs?: string[];
  toolContextOptions?: ToolContextOptions;
}

export const createDefaultRegistry = async (options: DefaultRegistryOptions = {}): Promise<ToolRegistry> => {
  const registry = createToolRegistry(options.permissions, options.onToolPending);
  const fs = createFilesystemTool({
    sandboxPaths: options.sandboxPaths,
    onSensitivePath: options.onSensitivePath,
  });

  const customToolsDirs = options.customToolsDirs ?? [];
  const contextOptions: ToolContextOptions | undefined = options.toolContextOptions ?? {
    sandboxPaths: options.sandboxPaths,
  };
  const loadedCustomTools: LoadedTool[] = [];
  for (const dir of customToolsDirs) {
    const loaded = await loadCustomTools(dir, contextOptions);
    loadedCustomTools.push(...loaded);
  }

  registry.register(
    "read_file",
    (args) => fs.read_file(args),
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read the contents of a file. Returns file content as a string.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the file to read",
            },
          },
          required: ["path"],
        },
      },
    },
  );

  registry.register(
    "write_file",
    (args) => fs.write_file(args),
    {
      type: "function",
      function: {
        name: "write_file",
        description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the file to write",
            },
            content: {
              type: "string",
              description: "Content to write to the file",
            },
          },
          required: ["path", "content"],
        },
      },
    },
  );

  registry.register(
    "list_dir",
    (args) => fs.list_dir(args),
    {
      type: "function",
      function: {
        name: "list_dir",
        description: "List files and directories in the given path.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Directory path to list (default: current directory)",
            },
          },
          required: ["path"],
        },
      },
    },
  );

  registry.register(
    "find_files",
    (args) => fs.find_files(args),
    {
      type: "function",
      function: {
        name: "find_files",
        description: "Search for files matching a glob pattern.",
        parameters: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              description: "Glob pattern to search for (e.g., '*.ts', 'src/**/*.js')",
            },
            path: {
              type: "string",
              description: "Directory to search in (default: current directory)",
            },
          },
          required: ["pattern"],
        },
      },
    },
  );

  for (const tool of loadedCustomTools) {
    registry.register(tool.name, tool.handler, tool.definition);
  }

  return registry;
};
