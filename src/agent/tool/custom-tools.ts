import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { InternalToolDefinition, InternalToolParam, ToolHandler, ToolResult } from "./internal";
import { createToolContext } from "./context";
import type { ToolContext, ToolContextOptions } from "./context";

export interface ToolManifest {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolManifestParam>;
    required?: string[];
  };
  guidelines?: readonly string[];
  writeOnly?: boolean;
}

export interface ToolManifestParam {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolManifestParam;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  properties?: Record<string, ToolManifestParam>;
  [key: string]: unknown;
}

export interface LoadedTool {
  name: string;
  definition: InternalToolDefinition;
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

const toManifestParam = (p: ToolManifestParam): InternalToolParam => {
  const result: InternalToolParam = { type: p.type };
  if (p.description) result.description = p.description;
  if (p.enum) result.enum = p.enum;
  if (p.items) result.items = toManifestParam(p.items);
  if (p.default !== undefined) result.default = p.default;
  if (p.minimum !== undefined) result.minimum = p.minimum;
  if (p.maximum !== undefined) result.maximum = p.maximum;
  if (p.minLength !== undefined) result.minLength = p.minLength;
  if (p.maxLength !== undefined) result.maxLength = p.maxLength;
  if (p.pattern) result.pattern = p.pattern;
  if (p.format) result.format = p.format;
  if (p.properties) {
    result.properties = Object.fromEntries(
      Object.entries(p.properties).map(([k, v]) => [k, toManifestParam(v)])
    );
  }
  return result;
};

const toToolDefinition = (manifest: ToolManifest): InternalToolDefinition => ({
  name: manifest.name,
  description: manifest.description,
  parameters: Object.fromEntries(
    Object.entries(manifest.parameters.properties).map(([k, v]) => [k, toManifestParam(v)])
  ),
  required: manifest.parameters.required,
  guidelines: manifest.guidelines,
  writeOnly: manifest.writeOnly,
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
