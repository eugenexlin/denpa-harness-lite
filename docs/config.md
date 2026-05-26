# Config

The denpa harness operates in two modes, determined by whether it's running inside a git repository.

## Modes

### Project Mode

When the harness is started inside a git repository, it walks up from the current working directory to find the `.git` folder. The directory containing `.git` becomes the **project root**.

In project mode, the harness loads:
- `~/.denpa/config.json` — user-level defaults
- `<projectRoot>/.denpa/config.json` — project-level overrides
- `<projectRoot>/.denpa/permissions.json` — project permissions

The harness prints `denpa [project: <path>]` at startup.

### System Mode

When the harness is started outside any git repository (no `.git` found walking up to the disk root), it runs in system mode.

In system mode, the harness loads:
- `~/.denpa/config.json` — user config
- `~/.denpa/permissions.json` — system permissions

The harness prints `denpa [system mode]` at startup.

## Config Files

### `~/.denpa/config.json` (User Config)

Always loaded. Contains model definitions and default settings.

```json
{
  "models": {
    "default": {
      "provider": "openai",
      "api_key": "sk-...",
      "base_url": "https://api.openai.com/v1"
    }
  },
  "default_model": "default",
  "max_parallel_agents": 0,
  "agent_block_prompt": true,
  "show_thinking": false
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `models` | `Record<string, ModelConfig>` | `{}` | Named model configurations. Each entry has `provider`, `api_key`, and `base_url`. |
| `default_model` | `string` | `""` | Name of the default model to use (must match a key in `models`). |
| `max_parallel_agents` | `number` | `0` | Maximum number of concurrent subagents. `0` means unlimited. |
| `agent_block_prompt` | `boolean` | `true` | Whether to block prompts for agents. |
| `show_thinking` | `boolean` | `false` | Whether to show model reasoning/thinking output in the REPL. |

### `<project>/.denpa/config.json` (Project Config)

Loaded in project mode. All fields are optional. Overrides user config.

```json
{
  "default_model": "project-model",
  "max_parallel_agents": 4,
  "show_thinking": true
}
```

| Key | Type | Description |
|-----|------|-------------|
| `default_model` | `string?` | Override the default model name. |
| `max_parallel_agents` | `number?` | Override max concurrent subagents. |
| `agent_block_prompt` | `boolean?` | Override agent blocking. |
| `show_thinking` | `boolean?` | Override thinking display. |

**Models merge**: If the project config defines a `models` entry, models are merged by name. User and project models are combined. If the same model name exists in both, the project entry fully replaces the user entry.

Example:
- User: `{ "gpt4": A, "claude": B }`
- Project: `{ "gpt4": C, "gemini": D }`
- Resolved: `{ "gpt4": C, "claude": B, "gemini": D }`

### `<project>/.denpa/permissions.json` (Project Permissions)

Loaded in project mode. Does **not** inherit from user-level permissions.

```json
{
  "sandbox_paths": ["."],
  "tools": {
    "read_file": { "state": "approved", "file_mtime": 1748123456789 },
    "write_file": { "state": "denied" }
  }
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `sandbox_paths` | `string[]` | `["."]` | Allowed filesystem paths for tool execution. Paths outside these are blocked. |
| `tools` | `Record<string, ToolPermission>` | `{}` | Tool approval state. See [Tool Approval](#tool-approval) below. |

### `~/.denpa/permissions.json` (System Permissions)

Loaded in system mode. Same structure as project permissions. In system mode, `sandbox_paths` controls which paths tools can access (defaults to full access with sensitive path warnings).

## Tool Approval

Each tool must be approved before use. The approval state is stored in `permissions.json` under the `tools` key.

### States

| State | Behavior |
|-------|----------|
| Not present | **Pending** — prompts for approval in REPL mode, denied in unattended mode. |
| `approved` | Allowed. The `file_mtime` is checked on each run. If the tool's source file has changed since approval, the tool becomes pending again. |
| `denied` | Denied silently. Never prompts again. The LLM will not have access to this tool. |

### REPL Approval Flow

When a pending tool is invoked in REPL mode:

```
⚠ Tool 'write_file' requires approval:
  Write content to a file. Creates the file if it doesn't exist.
  Params: path (string), content (string)
Approve? [y/N]
```

### Unattended Mode

In CLI or agent mode, pending tools are denied. Denied tools are logged and reported after execution completes.

## Sensitive Paths

Certain paths trigger a warning when accessed by tools. This is a **warning layer**, not a hard block. If the path is within `sandbox_paths`, the operation proceeds but a warning is shown.

Sensitive paths include:
- `~/.ssh/`, `~/.aws/`, `~/.gnupg/` — credential directories
- `~/.config/` / `%APPDATA%` — application config directories
- `.env` files — any file ending in `.env`
- OS system directories — `/etc/`, `C:\Windows\System32\`
- `.denpa/` folders — prevents LLM tools from modifying harness configuration

Harness code has free access to these paths. Only LLM-invoked tool execution triggers warnings.

## CLI Overrides

CLI flags take highest priority over all config files:

| Flag | Short | Description |
|------|-------|-------------|
| `--model <name>` | `-m` | Override the model name |
| `--api-key <key>` | `-k` | Override the API key |
| `--base-url <url>` | `-u` | Override the API base URL |

## Precedence Order

From highest to lowest priority:

1. CLI flags (`--model`, `--api-key`, `--base-url`)
2. Project config (`<project>/.denpa/config.json`)
3. User config (`~/.denpa/config.json`)
4. Environment variables (`OPENAI_API_KEY`, `OPENAI_BASE_URL`)
5. Hardcoded defaults

## Custom Tools

Custom tools extend the harness with user-defined functionality. Each tool is a directory containing a manifest and handler code.

### Folder Structure

```
.denpa/tools/
  my-tool/
    tool.json        # manifest
    handler.ts       # handler code (or .js, .mts, .mjs)
    utils.ts         # optional supporting files
```

**Locations:**
- Project mode: `<projectRoot>/.denpa/tools/`
- System mode: `~/.denpa/tools/`

### Manifest (`tool.json`)

The manifest mirrors the OpenAI function calling schema:

```json
{
  "name": "my_tool",
  "description": "Does something useful.",
  "parameters": {
    "type": "object",
    "properties": {
      "input": {
        "type": "string",
        "description": "The input value"
      }
    },
    "required": ["input"]
  }
}
```

| Key | Type | Description |
|-----|------|-------------|
| `name` | `string` | Tool name (must be unique across all tools) |
| `description` | `string` | Description shown to the LLM and during approval |
| `parameters` | `object` | JSON schema for tool parameters |

### Handler (`handler.ts`)

The handler is a TypeScript or JavaScript file that exports a default function:

```typescript
import type { ToolResult } from "denpa-harness-lite/src/agent/tool/types";

export default async (args: Record<string, unknown>): Promise<ToolResult> => {
  const input = args.input as string;
  // ... do something ...
  return { content: `Processed: ${input}` };
};
```

The handler receives the tool arguments and returns a `ToolResult` with `content` (and optionally `isError`).

Supported handler file extensions: `.ts`, `.js`, `.mts`, `.mjs`.

### Approval and Mtime Tracking

Custom tools follow the same approval system as built-in tools. Additionally, the harness tracks the modification time of **all files** in the tool directory. If any file changes (including supporting files like `utils.ts`), the tool requires re-approval.

This ensures that changes to tool code are always reviewed before execution.
