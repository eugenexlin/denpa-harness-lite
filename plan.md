# Denpa Harness Config & Permissions Plan

## Overview

The harness operates in two modes:

- **Project mode** — Running inside a git repo. Loads `<gitRoot>/.denpa/config.json` and `<gitRoot>/.denpa/permissions.json`.
- **System mode** — Running outside any git repo. Loads `~/.denpa/config.json` and `~/.denpa/permissions.json`.

Config hierarchy: user-level defaults → project-level overrides → CLI flags.

---

## Config Files

### `~/.denpa/config.json` (User Config)

Always loaded. Contains:

| Key | Type | Description |
|-----|------|-------------|
| `models` | `Record<string, ModelConfig>` | Named model configs (provider, api_key, base_url) |
| `default_model` | `string` | Default model name |
| `max_parallel_agents` | `number` | Max concurrent subagents |
| `agent_block_prompt` | `boolean` | Block prompts for agents |
| `show_thinking` | `boolean` | Show model reasoning output |

### `<project>/.denpa/config.json` (Project Config)

Loaded in project mode. All fields optional. Overrides user config:

| Key | Type | Description |
|-----|------|-------------|
| `default_model` | `string?` | Override default model |
| `max_parallel_agents` | `number?` | Override max agents |
| `agent_block_prompt` | `boolean?` | Override agent blocking |
| `show_thinking` | `boolean?` | Override thinking display |

**Models merge**: User and project `models` are merged by name (shallow at key level). Project wins on same name.

### `<project>/.denpa/permissions.json` (Project Permissions)

Loaded in project mode. Does NOT inherit from user permissions.

| Key | Type | Description |
|-----|------|-------------|
| `sandbox_paths` | `string[]` | Allowed filesystem paths for tools |
| `tools` | `Record<string, ToolPermission>` | Tool approval state |

### `~/.denpa/permissions.json` (System Permissions)

Loaded in system mode. Same structure as project permissions.

---

## Tool Approval

Each tool must be approved before use. State stored in `permissions.json` under `tools`:

```json
{
  "tools": {
    "read_file": { "state": "approved", "file_mtime": 1748123456789 },
    "write_file": { "state": "denied" }
  }
}
```

States:
- **Not present** → pending. Prompt in REPL, deny in unattended mode.
- **approved** → check `file_mtime` against current. Mismatch = pending (file changed).
- **denied** → deny silently. Never prompt again.

### REPL Approval Flow

When a pending tool is invoked:
```
⚠ Tool 'write_file' requires approval:
  Write content to a file. Creates the file if it doesn't exist.
  Params: path (string), content (string)
Approve? [y/N]
```

### Unattended Mode

Denied/pending tools return an error to the LLM. Denied tools are logged for post-execution summary.

---

## Sensitive Paths

Warning layer. Paths that trigger a warning when accessed by tools (not a hard block):

- `~/.ssh/`, `~/.aws/`, `~/.gnupg/`
- `~/.config/` / `%APPDATA%`
- `.env` files (any path ending in `.env`)
- OS system dirs: `/etc/`, `C:\Windows\System32\`
- `.denpa/` folders (prevent LLM from modifying permissions)

Harness code has free access. Only tool execution triggers warnings.

---

## Custom Tools (Future)

Custom tools will live in `.denpa/tools/` folders. Each tool is a directory with a manifest and handler files. File mtime changes trigger re-approval.

**To be refined:**
- Manifest format (`tool.json`)
- Handler execution model (Node.js, shell scripts, etc.)
- User-level vs project-level custom tools
- Tool discovery and registration

---

## Implementation Phases

### Phase 1: Config Hierarchy ✅ (Complete)
- [x] `src/config/types.ts` — Restructure types (UserConfig, ProjectConfig, PermissionsConfig, ResolvedConfig)
- [x] `src/config/manager.ts` — Git root detection, mode detection, deep merge, permissions loading
- [x] `src/main.ts` — Mode indicator at startup
- [x] `docs/config.md` — Documentation

### Phase 2: Permissions & Tool Approval ✅ (Complete)
- [x] `src/config/sensitive-paths.ts` — Sensitive path detection
- [x] `src/agent/tool/filesystem.ts` — Sensitive path warnings
- [x] `src/agent/tool/registry.ts` — Tool approval enforcement
- [x] `src/repl/repl.ts` — Approval prompt in REPL
- [x] Unattended mode denial logging

### Phase 3: Custom Tools ✅ (Complete)
- [x] `.denpa/tools/` folder structure
- [x] Tool manifest format (`tool.json`)
- [x] Handler execution model (dynamic import of .ts/.js)
- [x] Tool discovery and registration
- [x] Mtime tracking for re-approval on file changes

---

## Open Questions / To Refine

1. **Tool-to-file mapping**: How to track mtime for built-in tools vs custom tools
2. **Custom tools manifest**: Schema for `tool.json`
3. **Custom tools execution**: Sandboxing, language support, IPC model
4. **Denied tool reporting**: Format of post-execution summary in unattended mode
5. **`max_parallel_agents` and `agent_block_prompt`**: Not yet consumed by downstream code
6. **Config validation**: Schema validation on load
7. **Hot-reload**: Config changes not picked up until restart
