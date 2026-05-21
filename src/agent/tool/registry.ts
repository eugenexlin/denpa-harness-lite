import type { ToolDefinition, ToolHandler, ToolResult } from "./types";
import { createFilesystemTool } from "./filesystem";

export interface ToolRegistry {
  register: (name: string, handler: ToolHandler, definition: ToolDefinition) => void;
  getDefinition: (name: string) => ToolDefinition | undefined;
  getDefinitions: () => ToolDefinition[];
  execute: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  list: () => string[];
}

export const createToolRegistry = (): ToolRegistry => {
  const tools = new Map<string, { handler: ToolHandler; definition: ToolDefinition }>();

  return {
    register: (name: string, handler: ToolHandler, definition: ToolDefinition): void => {
      tools.set(name, { handler, definition });
    },

    getDefinition: (name: string): ToolDefinition | undefined => {
      return tools.get(name)?.definition;
    },

    getDefinitions: (): ToolDefinition[] => {
      return Array.from(tools.values()).map((t) => t.definition);
    },

    execute: async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
      const tool = tools.get(name);
      if (!tool) {
        return { content: `Unknown tool: ${name}`, isError: true };
      }

      try {
        return await tool.handler(args);
      } catch (err) {
        return {
          content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },

    list: (): string[] => {
      return Array.from(tools.keys());
    },
  };
};

export const createDefaultRegistry = (sandboxPaths: string[]): ToolRegistry => {
  const registry = createToolRegistry();
  const fs = createFilesystemTool(sandboxPaths);

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

  return registry;
};
