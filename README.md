# denpa-harness-lite

CLI coding harness for OpenAI-compatible APIs. Interactive REPL and one-shot modes with subagent support.

## Installation

```bash
# Clone and install dependencies
git clone <repo-url>
cd denpa-harness-lite
bun install

# Link globally (optional)
bun link
```

## Usage

```bash
# REPL mode (interactive)
denpa

# One-shot mode
denpa "what is the capital of France?"

# With custom model
denpa -m gpt-4o "explain quantum computing"

# With custom API endpoint
denpa -u https://localhost:11434/v1 -k ollama "write a hello world in rust"
```

### REPL Commands

| Key | Action |
|-----|--------|
| `Enter` | Submit message |
| `Shift+Enter` | Newline in input |
| `Ctrl+C` | Cancel input / abort running agent |
| `Ctrl+D` | Delete char at cursor (or exit if empty) |
| `Ctrl+U` | Clear input line |
| `Ctrl+W` | Delete word |
| `Ctrl+A` | Move to start of input |
| `Ctrl+E` | Move to end of input |
| `← →` | Move cursor |
| `Tab` | Cycle slash commands |

### Slash Commands

| Command | Description |
|---------|-------------|
| `/model <name>` | Switch model |
| `/clear` | Clear session history |
| `/agent <prompt>` | Spawn subagent |
| `/agents` | List agents |
| `/config` | Show current config |
| `/stats` | Show session stats |
| `/tools` | List available tools |
| `/exit` | Exit REPL |
| `/help` | Show help |

## Configuration

Config is resolved in priority order (lowest to highest):

1. **Defaults** — hardcoded fallbacks
2. **User config** — `~/.denpa/config.json`
3. **Project config** — `.denpa/config.json` (in your project root)
4. **CLI flags** — `--model`, `--api-key`, `--base-url`

### User Config (`~/.denpa/config.json`)

```json
{
  "models": {
    "gpt-4o": {
      "provider": "openai",
      "api_key": "sk-...",
      "base_url": "https://api.openai.com/v1"
    },
    "claude-sonnet": {
      "provider": "anthropic",
      "api_key": "sk-ant-...",
      "base_url": "https://api.anthropic.com/v1"
    },
    "llama3": {
      "provider": "ollama",
      "api_key": "ollama",
      "base_url": "http://localhost:11434/v1"
    }
  },
  "default_model": "gpt-4o",
  "max_parallel_agents": 0,
  "agent_block_prompt": true
}
```

### Config Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `models` | `Record<string, ModelConfig>` | `{}` | Named model configurations |
| `default_model` | `string` | `""` | Model name to use by default (must match a key in `models`) |
| `max_parallel_agents` | `number` | `0` | Max concurrent subagents (0 = unlimited) |
| `agent_block_prompt` | `boolean` | `true` | Block REPL prompt while agents are running |

### Model Config

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | `string` | Yes | Provider name (e.g., `"openai"`, `"ollama"`) |
| `api_key` | `string` | Yes | API key |
| `base_url` | `string` | Yes | API base URL (e.g., `https://api.openai.com/v1`) |

### Project Config (`.denpa/config.json`)

```json
{
  "sandbox_paths": ["."],
  "enabled_tools": ["read_file", "write_file", "list_dir", "find_files"]
}
```

### Project Config Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sandbox_paths` | `string[]` | `["."]` | Directories tools can access (relative to project root) |
| `enabled_tools` | `string[]` | `[]` | Tool names to enable (empty = all built-in tools) |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | API key (overrides config) |
| `OPENAI_BASE_URL` | API base URL (overrides config) |

### Stats Database

Session stats are stored in `~/.denpa/stats.db`:

```sql
CREATE TABLE daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE NOT NULL,
  total_duration_ms INTEGER DEFAULT 0,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  request_count INTEGER DEFAULT 0
);
```
