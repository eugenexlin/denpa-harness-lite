import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModelCache } from "./model-cache";
import type { ModelConfig } from "../config/types";
import { setLogSink, setFileLoggingEnabled } from "../utils/logger";

const models: Record<string, ModelConfig> = {
  fast: {
    provider: "openai",
    api_key: "k",
    base_url: "http://localhost:9999/v1",
    model: "gpt-x",
  },
  slow: {
    provider: "openai",
    api_key: "k",
    base_url: "http://localhost:9999/v1",
  },
};

const entry = (modelIds: string[], nCtx?: number) => ({
  fetchedAt: Date.now(),
  models: modelIds.map((id) => ({
    id,
    aliases: [],
    tags: [],
    object: "model",
    created: 0,
    owned_by: "",
    meta: nCtx
      ? {
          vocab_type: 0,
          n_vocab: 0,
          n_ctx: nCtx,
          n_ctx_train: 0,
          n_embd: 0,
          n_params: 0,
          size: 0,
        }
      : undefined,
  })),
});

let cachePath: string;
let originalFetch: typeof fetch;
let logMessages: string[];

beforeEach(() => {
  cachePath = join(
    tmpdir(),
    `denpa-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  originalFetch = globalThis.fetch;
  logMessages = [];
  setFileLoggingEnabled(false);
  setLogSink({
    write: (_level, message) => {
      logMessages.push(message);
    },
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setFileLoggingEnabled(true);
  if (existsSync(cachePath)) rmSync(cachePath);
});

describe("getContextWindow", () => {
  it("returns the config override when set", () => {
    const m = createModelCache(cachePath, {
      a: {
        provider: "p",
        api_key: "k",
        base_url: "http://x/v1",
        context_window: 1234,
      },
    });
    expect(m.getContextWindow("a")).toBe(1234);
  });

  it("falls back to cached n_ctx, looked up by explicit model id", () => {
    writeFileSync(
      cachePath,
      JSON.stringify({ a: entry(["other", "real-id"], 4096) }),
    );
    const m = createModelCache(cachePath, {
      a: { provider: "p", api_key: "k", base_url: "http://x/v1", model: "real-id" },
    });
    expect(m.getContextWindow("a")).toBe(4096);
  });

  it("returns null when neither override nor cache is present", () => {
    const m = createModelCache(cachePath, {
      a: { provider: "p", api_key: "k", base_url: "http://x/v1" },
    });
    expect(m.getContextWindow("a")).toBeNull();
  });
});

describe("getModelInfo", () => {
  it("looks up by explicit model id, not the alias", () => {
    writeFileSync(cachePath, JSON.stringify({ a: entry(["other", "real-id"]) }));
    const m = createModelCache(cachePath, {
      a: { provider: "p", api_key: "k", base_url: "http://x/v1", model: "real-id" },
    });
    expect(m.getModelInfo("a")?.id).toBe("real-id");
  });

  it("falls back to the first model when the id is not found", () => {
    writeFileSync(cachePath, JSON.stringify({ a: entry(["first"]) }));
    const m = createModelCache(cachePath, {
      a: { provider: "p", api_key: "k", base_url: "http://x/v1", model: "missing" },
    });
    expect(m.getModelInfo("a")?.id).toBe("first");
  });

  it("returns null when there is no cache entry", () => {
    const m = createModelCache(cachePath, {
      a: { provider: "p", api_key: "k", base_url: "http://x/v1" },
    });
    expect(m.getModelInfo("a")).toBeNull();
  });
});

describe("fetchIfNeeded", () => {
  it("skips the network when the cache is fresh", async () => {
    writeFileSync(
      cachePath,
      JSON.stringify({ fast: entry(["gpt-x"]), slow: entry(["slow"]) }),
    );
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const m = createModelCache(cachePath, models);
    await m.fetchIfNeeded();
    expect(calls).toBe(0);
  });

  it("fetches when stale, updates the cache, and fires onUpdate", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: [{ id: "gpt-x" }] }), {
        status: 200,
      })) as unknown as typeof fetch;

    let updated = false;
    const m = createModelCache(cachePath, models);
    m.setOnUpdate(() => {
      updated = true;
    });
    await m.fetchIfNeeded();

    expect(updated).toBe(true);
    expect(m.getModelInfo("fast")?.id).toBe("gpt-x");
    expect(existsSync(cachePath)).toBe(true);
  });

  it("logs the error and leaves the cache untouched on failure", async () => {
    globalThis.fetch = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;

    const m = createModelCache(cachePath, models);
    await m.fetchIfNeeded();

    expect(logMessages.some((msg) => msg.includes("boom"))).toBe(true);
    expect(m.getModelInfo("fast")).toBeNull();
  });

  it("aborts a hanging fetch after the timeout instead of blocking", async () => {
    globalThis.fetch = ((
      _url: unknown,
      init: { signal?: AbortSignal },
    ) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      })) as unknown as typeof fetch;

    const m = createModelCache(cachePath, models, 50);
    const start = Date.now();
    await m.fetchIfNeeded();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(logMessages.some((msg) => msg.includes("Timed out"))).toBe(true);
    expect(m.getModelInfo("fast")).toBeNull();
  });
});
