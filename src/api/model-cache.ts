import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ModelConfig } from "../config/types";

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
): Promise<CachedModel[]> => {
  const url = `${normalizeBaseUrl(baseUrl)}/models`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, { method: "GET", headers });

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
  fetchIfNeeded: (models: Record<string, ModelConfig>) => Promise<void>;
  getModelInfo: (modelName: string) => CachedModel | null;
  getEntry: (configName: string) => ModelCacheEntry | null;
  getAllModels: () => ModelCacheData;
}

export const createModelCache = (
  cachePath: string,
): ModelCacheManager => {
  let cache: ModelCacheData = loadCache(cachePath);

  const persist = (): void => {
    saveCache(cachePath, cache);
  };

  return {
    fetchIfNeeded: async (models: Record<string, ModelConfig>): Promise<void> => {
      const servers = groupByServer(models);
      const fetches: Promise<void>[] = [];

      for (const [baseUrl, { names, apiKey }] of servers) {
        const needsFetch = names.some(name => {
          const entry = cache[name];
          return !entry || !isCacheFresh(entry.fetchedAt);
        });
        if (!needsFetch) continue;

        fetches.push(
          (async () => {
            try {
              const fetched = await fetchServerModels(baseUrl, apiKey);
              const entry: ModelCacheEntry = {
                fetchedAt: Date.now(),
                models: fetched,
              };
              for (const name of names) {
                cache[name] = entry;
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error(`[model-cache] ${message}`);
            }
          })(),
        );
      }

      await Promise.all(fetches);
      persist();
    },

    getModelInfo: (modelName: string): CachedModel | null => {
      const entry = cache[modelName];
      if (!entry) return null;
      return entry.models.find(m => m.id === modelName) ?? entry.models[0] ?? null;
    },

    getEntry: (configName: string): ModelCacheEntry | null => {
      return cache[configName] ?? null;
    },

    getAllModels: (): ModelCacheData => cache,
  };
};
