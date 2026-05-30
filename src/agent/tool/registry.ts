import type {
  InternalToolDefinition,
  ToolHandler,
  ToolResult,
} from "./internal";
import { TOOL_GUIDELINES } from "../guidelines";

export type { ToolResult };
import type {
  PermissionsConfig,
  ToolPermissionState,
} from "../../config/types";
import { createFilesystemTool, type FilesystemToolOptions } from "./filesystem";
import {
  loadCustomTools,
  checkToolMtimes,
  type LoadedTool,
} from "./custom-tools";
import type { ToolContextOptions } from "./context";

export interface ToolRegistry {
  register: (
    name: string,
    handler: ToolHandler,
    definition: InternalToolDefinition,
  ) => void;
  getDefinition: (name: string) => InternalToolDefinition | undefined;
  getDefinitions: () => InternalToolDefinition[];
  execute: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  list: () => string[];
  getDeniedTools: () => string[];
  updateApprovalCallback: (callback: ToolApprovalCallback | undefined) => void;
  setReadonlyMode: (readonly: boolean) => void;
}

export interface ToolApprovalCallback {
  (
    name: string,
    definition: InternalToolDefinition,
    args: Record<string, unknown>,
  ): Promise<ToolPermissionState>;
}

export interface PermissionChangeCallback {
  (name: string, state: ToolPermissionState): void;
}

export const createToolRegistry = (
  permissions: PermissionsConfig = {},
  onToolPending?: ToolApprovalCallback,
  onPermissionChange?: PermissionChangeCallback,
): ToolRegistry => {
  const tools = new Map<
    string,
    { handler: ToolHandler; definition: InternalToolDefinition }
  >();
  const deniedLog: string[] = [];
  let currentApprovalCallback: ToolApprovalCallback | undefined = onToolPending;
  let isReadonlyMode = true;

  const isToolApproved = (name: string): boolean => {
    const toolPerms = permissions.tools?.[name];
    if (!toolPerms) return false;
    if (toolPerms.state === "approve_always") return true;
    if (toolPerms.state === "approve_once") return false;
    if (toolPerms.state === "deny") return false;
    return false;
  };

  return {
    register: (
      name: string,
      handler: ToolHandler,
      definition: InternalToolDefinition,
    ): void => {
      tools.set(name, { handler, definition });
    },

    getDefinition: (name: string): InternalToolDefinition | undefined => {
      return tools.get(name)?.definition;
    },

    getDefinitions: (): InternalToolDefinition[] => {
      return Array.from(tools.entries()).map(([, t]) => t.definition);
    },

    execute: async (
      name: string,
      args: Record<string, unknown>,
    ): Promise<ToolResult> => {
      const tool = tools.get(name);
      if (!tool) {
        return { content: `Unknown tool: ${name}`, isError: true };
      }

      if (isReadonlyMode && tool.definition.writeOnly) {
        return {
          content: `Tool '${name}' cannot be used in Read mode. Use Tab to switch to Write mode.`,
          isError: true,
        };
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
      if (toolPerms?.state === "deny") {
        deniedLog.push(name);
        return {
          content: `Tool '${name}' has been denied and cannot be used.`,
          isError: true,
        };
      }

      if (currentApprovalCallback) {
        const decision = await currentApprovalCallback(
          name,
          tool.definition,
          args,
        );

        if (decision === "approve_always") {
          permissions.tools = permissions.tools ?? {};
          permissions.tools[name] = { state: "approve_always" };
          onPermissionChange?.(name, "approve_always");
          try {
            return await tool.handler(args);
          } catch (err) {
            return {
              content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
              isError: true,
            };
          }
        }

        if (decision === "approve_once") {
          try {
            return await tool.handler(args);
          } catch (err) {
            return {
              content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
              isError: true,
            };
          }
        }

        permissions.tools = permissions.tools ?? {};
        permissions.tools[name] = { state: "deny" };
        onPermissionChange?.(name, "deny");
        deniedLog.push(name);
        return {
          content: `Tool '${name}' was denied.`,
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
      return Array.from(tools.keys());
    },

    getDeniedTools: (): string[] => {
      return deniedLog;
    },

    updateApprovalCallback: (
      callback: ToolApprovalCallback | undefined,
    ): void => {
      currentApprovalCallback = callback;
    },

    setReadonlyMode: (readonly: boolean): void => {
      isReadonlyMode = readonly;
    },
  };
};

export interface DefaultRegistryOptions {
  sandboxPaths?: string[];
  permissions?: PermissionsConfig;
  onToolPending?: ToolApprovalCallback;
  onPermissionChange?: PermissionChangeCallback;
  onSensitivePath?: (path: string, reason: string) => void;
  customToolsDirs?: string[];
  toolContextOptions?: ToolContextOptions;
}

export const createDefaultRegistry = async (
  options: DefaultRegistryOptions = {},
): Promise<ToolRegistry> => {
  const registry = createToolRegistry(
    options.permissions,
    options.onToolPending,
    options.onPermissionChange,
  );
  const fs = createFilesystemTool({
    sandboxPaths: options.sandboxPaths,
    onSensitivePath: options.onSensitivePath,
  });

  const customToolsDirs = options.customToolsDirs ?? [];
  const contextOptions: ToolContextOptions | undefined =
    options.toolContextOptions ?? {
      sandboxPaths: options.sandboxPaths,
    };
  const loadedCustomTools: LoadedTool[] = [];
  for (const dir of customToolsDirs) {
    const loaded = await loadCustomTools(dir, contextOptions);
    loadedCustomTools.push(...loaded);
  }

  registry.register("read", (args) => fs.read_file(args), {
    name: "read",
    description:
      "Read the contents of a file. Returns file content as a string.",
    parameters: {
      path: {
        type: "string",
        description: "Path to the file to read",
      },
    },
    required: ["path"],
    guidelines: TOOL_GUIDELINES.read,
  });

  registry.register("write", (args) => fs.write_file(args), {
    name: "write",
    description:
      "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
    parameters: {
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
    guidelines: TOOL_GUIDELINES.write,
    writeOnly: true,
  });

  registry.register("ls", (args) => fs.list_dir(args), {
    name: "ls",
    description: "List files and directories in the given path.",
    parameters: {
      path: {
        type: "string",
        description: "Directory path to list (default: current directory)",
      },
    },
    required: ["path"],
    guidelines: TOOL_GUIDELINES.ls,
  });

  registry.register("find", (args) => fs.find_files(args), {
    name: "find",
    description: "Search for files matching a glob pattern.",
    parameters: {
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
    guidelines: TOOL_GUIDELINES.find,
  });

  for (const tool of loadedCustomTools) {
    registry.register(tool.name, tool.handler, tool.definition);
  }

  return registry;
};
