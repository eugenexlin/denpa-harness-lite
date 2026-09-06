import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ModelConfig } from "../config/types";
import { logger } from "../utils/logger";

export interface ModelMeta {
  vocab_type: number;
  n_vocab: number;
  n_ctx: number;
  n_ctx_train: number;
  n_embd: number;
  n_params: number;
  size: number;
}

export interface CachedModel {
  id: string;
  aliases: string[];
  tags: string[];
  object: string;
  created: number;
  owned_by: string;
  meta?: ModelMeta;
}

export interface ModelCacheEntry {
  fetchedAt: number;
  models: CachedModel[];
}

export type ModelCacheData = Record<string, ModelCacheEntry>;

const CACHE_EXPIRATION_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, "");

const loadCache = (cachePath: string): ModelCacheData => {
  if (!existsSync(cachePath)) return {};
  try {
    return JSON.parse(readFileSync(cachePath, "utf-8")) as ModelCacheData;
  } catch {
    return {};
  }
};

const saveCache = (cachePath: string, data: ModelCacheData): void => {
  const dir = dirname(cachePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(cachePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
};

const isCacheFresh = (fetchedAt: number): boolean => {
  return Date.now() - fetchedAt < CACHE_EXPIRATION_MS;
};

const fetchServerModels = async (
  baseUrl: string,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<CachedModel[]> => {
  const url = `${normalizeBaseUrl(baseUrl)}/models`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, { method: "GET", headers, signal });

  if (!response.ok) {
    throw new Error(`Failed to fetch models from ${url}: ${response.status}`);
  }

  const json = (await response.json()) as Record<string, unknown>;
  const data = (json.data ?? json.models ?? []) as unknown[];
  return data.map((m: any) => ({
    id: m.id ?? m.name ?? "",
    aliases: m.aliases ?? [],
    tags: m.tags ?? [],
    object: m.object ?? "model",
    created: m.created ?? 0,
    owned_by: m.owned_by ?? "",
    meta: m.meta ? {
      vocab_type: m.meta.vocab_type ?? 0,
      n_vocab: m.meta.n_vocab ?? 0,
      n_ctx: m.meta.n_ctx ?? 0,
      n_ctx_train: m.meta.n_ctx_train ?? 0,
      n_embd: m.meta.n_embd ?? 0,
      n_params: m.meta.n_params ?? 0,
      size: m.meta.size ?? 0,
    } : undefined,
  }));
};

const groupByServer = (
  models: Record<string, ModelConfig>,
): Map<string, { names: string[]; apiKey?: string }> => {
  const servers = new Map<string, { names: string[]; apiKey?: string }>();
  for (const [name, config] of Object.entries(models)) {
    const normalized = normalizeBaseUrl(config.base_url);
    const entry = servers.get(normalized);
    if (entry) {
      entry.names.push(name);
    } else {
      servers.set(normalized, { names: [name], apiKey: config.api_key || undefined });
    }
  }
  return servers;
};

export interface ModelCacheManager {
  fetchIfNeeded: () => Promise<void>;
  cancelPending: () => void;
  setOnUpdate: (cb: () => void) => void;
  getModelInfo: (alias: string) => CachedModel | null;
  getContextWindow: (alias: string) => number | null;
  getEntry: (configName: string) => ModelCacheEntry | null;
  getAllModels: () => ModelCacheData;
}

export const createModelCache = (
  cachePath: string,
  models: Record<string, ModelConfig>,
  fetchTimeoutMs: number = FETCH_TIMEOUT_MS,
): ModelCacheManager => {
  let cache: ModelCacheData = loadCache(cachePath);
  let onUpdate: (() => void) | null = null;
  const controllers = new Set<AbortController>();

  const persist = (): void => {
    saveCache(cachePath, cache);
  };

  const modelIdFor = (alias: string): string => models[alias]?.model ?? alias;

  return {
    fetchIfNeeded: async (): Promise<void> => {
      const servers = groupByServer(models);
      const fetches: Promise<void>[] = [];

      for (const [baseUrl, { names, apiKey }] of servers) {
        const needsFetch = names.some(name => {
          const entry = cache[name];
          return !entry || !isCacheFresh(entry.fetchedAt);
        });
        if (!needsFetch) continue;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
        controllers.add(controller);

        fetches.push(
          (async () => {
            try {
              const fetched = await fetchServerModels(
                baseUrl,
                apiKey,
                controller.signal,
              );
              const entry: ModelCacheEntry = {
                fetchedAt: Date.now(),
                models: fetched,
              };
              for (const name of names) {
                cache[name] = entry;
              }
            } catch (err) {
              const message = controller.signal.aborted
                ? `Timed out after ${fetchTimeoutMs}ms fetching models from ${normalizeBaseUrl(baseUrl)}`
                : err instanceof Error
                  ? err.message
                  : String(err);
               logger.error(`[model-cache] ${message}`);
            } finally {
              clearTimeout(timer);
              controllers.delete(controller);
            }
          })(),
        );
      }

      await Promise.all(fetches);
      if (fetches.length > 0) {
        persist();
        onUpdate?.();
      }
    },

    cancelPending: (): void => {
      for (const c of controllers) c.abort();
      controllers.clear();
    },

    setOnUpdate: (cb: () => void): void => {
      onUpdate = cb;
    },

    getModelInfo: (alias: string): CachedModel | null => {
      const entry = cache[alias];
      if (!entry) return null;
      const modelId = modelIdFor(alias);
      return entry.models.find(m => m.id === modelId) ?? entry.models[0] ?? null;
    },

    getContextWindow: (alias: string): number | null => {
      const cfg = models[alias];
      if (cfg?.context_window && cfg.context_window > 0) {
        return cfg.context_window;
      }
      const entry = cache[alias];
      if (!entry) return null;
      const modelId = modelIdFor(alias);
      const m = entry.models.find(x => x.id === modelId) ?? entry.models[0];
      return m?.meta?.n_ctx ?? null;
    },

    getEntry: (configName: string): ModelCacheEntry | null => {
      return cache[configName] ?? null;
    },

    getAllModels: (): ModelCacheData => cache,
  };
};
