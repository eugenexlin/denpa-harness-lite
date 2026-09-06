# Denpa Harness — Model Tiers & Context Plan

## Architecture

Single process. No recursive CLI spawning. Everything (REPL, subagents, future
workflows) shares the resolved config, one model-cache instance, and per-model
API clients.

**Model-cache pull** is non-blocking and time-capped:

- **REPL** — `fetchIfNeeded()` runs in the background (3s cap per server,
  parallel across servers). The panel re-renders when data lands.
- **CLI** — loads the cache from disk only. No network, no startup delay.
- **Fresh cache** (< 10 min) → zero network calls in both modes.

A dead/unreachable server only logs its own error and never blocks startup or
affects other servers.

## Model Config

`ModelConfig` (each named entry under `models`):

| Field | Type | Notes |
|-------|------|-------|
| `provider` | string | e.g. `openai`, `ollama` |
| `api_key` | string | |
| `base_url` | string | |
| `model` | string? | API model id. Defaults to the config key (alias). Decouples the alias from the underlying LLM. |
| `temperature` | number? | Sent in the request payload when set. |
| `top_p` | number? | Same. |
| `max_tokens` | number? | Same. |
| `context_window` | number? | Max-context override; wins over server-reported `n_ctx`. |

Two aliases can share one underlying LLM with different params (e.g. `fast` and
`creative` both → `gpt-4o-mini` at different `temperature`).

### Tiers (light / medium / heavy)

A fixed 3-role enum for agentic mode, mapping a tier to a model alias:

```json
"agent_tiers": { "light": "fast", "medium": "sonnet", "heavy": "opus" }
```

- Lives in user + project config; project overrides user per-tier.
- Exposed on `ResolvedConfig.agentTiers`; unknown model refs warn at startup.
- A tier resolves to: alias → `ModelConfig` (params) + `modelCache[alias].meta.n_ctx`.

### Context-window resolution

`modelCache.getContextWindow(alias)` returns, in order:

1. `ModelConfig.context_window` (if set), else
2. cached `n_ctx` (looked up by the explicit `model` id), else
3. `null` (no cap).

`n_ctx` is a stable property, so a stale cache entry is still valid for this.

## Layers

### Layer 1 — Foundation (in place)

- Non-blocking, 3s-capped model-cache pull; `cancelPending()` / `setOnUpdate()`.
- `ModelConfig` params + `model` id; client is a factory over `ModelConfig`
  (`createAPIClient(modelConfig, alias, resolveModel?, opts)`) that emits the
  model id + set params. `/model` switching now resolves the full config.
- `agent_tiers` config + merge + startup validation.
- `getContextWindow()` resolver; `getModelInfo()` looks up by model id.
- REPL panel refreshes when the background pull completes.

### Layer 2 — Context monitoring (next)

- Track current-context token usage against `getContextWindow()`.
- Decide when to consolidate/summarize vs. close the session.
- Needs a real current-context token estimate (today it's a crude `char/4`).

### Layer 3 — Workflows (later)

- Composable TypeScript workflows mixing deterministic steps and tiered LLM steps.
- Primitives: `agent(tier, prompt, opts)` (full subagent) and
  `llm(tier, messages, opts)` (single completion).
- Builds on the existing in-process subagent + custom-tool machinery.
- Tier = efficiency knob; sequencing/parallelism = throughput knob.

## Open / To Refine

- **Layer 2** — consolidation threshold policy (% of window vs. hard token cap).
- **Layer 2** — accurate current-context token accounting (replace `char/4`).
- **Layer 3** — workflow discovery/registration (e.g. `.denpa/workflows/`),
  error handling, and passing results between steps.
- **Per-subagent model** — subagents currently reuse the parent client;
  tier-aware spawning lands with Layer 3.
