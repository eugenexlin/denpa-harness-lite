import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ToolDefinition, ToolHandler, ToolResult } from "./types";
import { createToolContext } from "./context";
import type { ToolContext, ToolContextOptions } from "./context";

export interface ToolManifest {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParam>;
    required?: string[];
  };
}

export interface ToolParam {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string; enum?: string[] };
}

export interface LoadedTool {
  name: string;
  definition: ToolDefinition;
  handler: ToolHandler;
  fileMtimes: Record<string, number>;
  context?: ToolContext;
}

const MANIFEST_FILE = "tool.json";
const HANDLER_EXTENSIONS = [".ts", ".js", ".mts", ".mjs"];

const getDirMtimes = (dir: string): Record<string, number> | null => {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    const mtimes: Record<string, number> = {};
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const stat = statSync(fullPath);
      mtimes[entry.name] = stat.mtimeMs;
    }
    return mtimes;
  } catch {
    return null;
  }
};

const mtimesMatch = (
  stored: Record<string, number>,
  current: Record<string, number>,
): boolean => {
  const allKeys = new Set([...Object.keys(stored), ...Object.keys(current)]);
  for (const key of allKeys) {
    if (stored[key] !== current[key]) return false;
  }
  return true;
};

const loadManifest = (dir: string): ToolManifest | null => {
  const manifestPath = join(dir, MANIFEST_FILE);
  if (!existsSync(manifestPath)) return null;
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as ToolManifest;
  } catch {
    return null;
  }
};

const toToolDefinition = (manifest: ToolManifest): ToolDefinition => ({
  type: "function",
  function: {
    name: manifest.name,
    description: manifest.description,
    parameters: manifest.parameters,
  },
});

const loadHandler = async (
  dir: string,
  manifest: ToolManifest,
): Promise<ToolHandler | null> => {
  for (const ext of HANDLER_EXTENSIONS) {
    const handlerPath = join(dir, `handler${ext}`);
    if (existsSync(handlerPath)) {
      try {
        const mod = await import(handlerPath);
        const handler = mod.default as
          | ((args: Record<string, unknown>) => Promise<ToolResult>)
          | undefined;
        if (handler && typeof handler === "function") {
          return handler;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
};

export const discoverTools = (toolsDir: string): string[] => {
  if (!existsSync(toolsDir)) return [];
  const entries = readdirSync(toolsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => join(toolsDir, e.name));
};

export const loadCustomTools = async (
  toolsDir: string,
  contextOptions?: ToolContextOptions,
): Promise<LoadedTool[]> => {
  const toolDirs = discoverTools(toolsDir);
  const loaded: LoadedTool[] = [];

  const context = contextOptions ? createToolContext(contextOptions) : undefined;

  for (const dir of toolDirs) {
    const manifest = loadManifest(dir);
    if (!manifest) continue;

    const mtimes = getDirMtimes(dir);
    if (!mtimes) continue;

    const rawHandler = await loadHandler(dir, manifest);
    if (!rawHandler) continue;

    const handler: ToolHandler = async (args: Record<string, unknown>): Promise<ToolResult> => {
      const enriched = context ? { ...args, __context: context } : args;
      return rawHandler(enriched);
    };

    loaded.push({
      name: manifest.name,
      definition: toToolDefinition(manifest),
      handler,
      fileMtimes: mtimes,
      context,
    });
  }

  return loaded;
};

export const checkToolMtimes = (
  tool: LoadedTool,
  toolsDir: string,
): boolean => {
  const toolDir = join(toolsDir, tool.name);
  const current = getDirMtimes(toolDir);
  if (!current) return false;
  return mtimesMatch(tool.fileMtimes, current);
};
