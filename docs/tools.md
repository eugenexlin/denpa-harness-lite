# Tools

Tools are the interface between the LLM and the system. Built-in tools are registered in `createDefaultRegistry`, and custom tools are loaded from `.denpa/tools/` directories.

## Built-in Tools

### Current Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read full file contents |
| `write_file` | Overwrite entire file |
| `list_dir` | List directory entries |
| `find_files` | Glob pattern file search |

### Naming Conventions

- **snake_case** — all tool names use snake_case (e.g., `read_file`, `edit_file`, `grep`)
- **verb_first** — names start with an action verb (read, write, list, find, search, execute)
- **unique** — names must be unique across all built-in and custom tools

### File Organization

Tools are organized by domain in `src/agent/tool/`:

```
src/agent/tool/
  types.ts          # shared types (ToolDefinition, ToolResult, ToolHandler, ToolParam)
  exports.ts        # public re-exports for custom tools
  context.ts        # ToolContext helper (sandbox validation, sensitive paths)
  registry.ts       # tool registry and createDefaultRegistry
  filesystem.ts     # filesystem tools (read_file, write_file, list_dir, find_files)
  custom-tools.ts   # custom tool loading and mtime tracking
```

New tool domains should follow the same pattern: create a file (e.g., `search.ts`), implement a factory function (e.g., `createSearchTool`), and register in `createDefaultRegistry`.

### Factory Pattern

Each tool domain uses a factory function that returns an object of handlers:

```typescript
export interface MyTool {
  my_action: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export const createMyTool = (options: MyToolOptions = {}): MyTool => {
  return {
    my_action: async (args: Record<string, unknown>): Promise<ToolResult> => {
      // implementation
      return { content: "result" };
    },
  };
};
```

### Handler Contract

All handlers follow the same signature:

```typescript
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;
```

- **Input**: `args` — key-value map from the LLM's function call arguments
- **Output**: `Promise<ToolResult>` — always returns a `ToolResult`

### ToolResult

```typescript
interface ToolResult {
  content: string;       // The result text (success or error message)
  isError?: boolean;     // Set to true for error responses
}
```

### Error Handling

**Never throw.** Always return an error result:

```typescript
// Correct
return { content: `Error: file not found: ${path}`, isError: true };

// Wrong
throw new Error(`file not found: ${path}`);
```

### Security

Filesystem tools must:
1. Validate paths against `sandboxPaths` (throw if outside sandbox)
2. Warn on sensitive paths (`.ssh`, `.aws`, `.env`, etc.)

Non-filesystem tools should validate all inputs and return errors for invalid arguments.

### Registration

Tools are registered in `createDefaultRegistry` in `registry.ts`:

```typescript
registry.register(
  "tool_name",
  (args) => fs.tool_name(args),
  {
    type: "function",
    function: {
      name: "tool_name",
      description: "Description shown to the LLM.",
      parameters: {
        type: "object",
        properties: {
          param_name: {
            type: "string",
            description: "Parameter description",
          },
        },
        required: ["param_name"],
      },
    },
  },
);
```

The schema follows the OpenAI function calling format. The `description` field is critical — it guides the LLM on when and how to use the tool.

---

## Custom Tools

Custom tools extend the harness with user-defined functionality. Each tool is a directory containing a manifest and handler code.

### Folder Structure

```
.denpa/tools/<tool-name>/
  tool.json        # manifest (required)
  handler.ts       # handler (required, .js/.mts/.mjs also supported)
  utils.ts         # optional supporting files
```

**Locations:**
- Project mode: `<projectRoot>/.denpa/tools/`
- System mode: `~/.denpa/tools/`

### Manifest (`tool.json`)

The manifest follows the OpenAI function calling schema:

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
| `name` | `string` | Tool name (must be unique, snake_case) |
| `description` | `string` | Description shown to the LLM and during approval |
| `parameters` | `object` | JSON Schema for tool parameters |

### Handler (`handler.ts`)

The handler exports a default async function:

```typescript
import type { ToolResult } from "denpa-harness-lite/src/agent/tool/exports";

export default async (args: Record<string, unknown>): Promise<ToolResult> => {
  const input = args.input as string;
  // ... do something ...
  return { content: `Processed: ${input}` };
};
```

Supported handler file extensions: `.ts`, `.js`, `.mts`, `.mjs`. The harness tries each extension in order and loads the first match.

### Type Imports

Import shared types from the exports file:

```typescript
import type { ToolResult, ToolHandler, ToolDefinition, ToolParam } from "denpa-harness-lite/src/agent/tool/exports";
```

### Tool Context

Custom tools receive an optional `__context` object in their `args` that provides sandbox validation and sensitive path detection:

```typescript
import type { ToolResult, ToolContext } from "denpa-harness-lite/src/agent/tool/exports";

export default async (args: Record<string, unknown>): Promise<ToolResult> => {
  const ctx = args.__context as ToolContext | undefined;

  if (ctx) {
    // Validate path against sandbox (throws if outside)
    const resolved = ctx.validatePath(args.path as string);

    // Warn on sensitive paths
    ctx.warnSensitive(resolved);

    // Check if path is sensitive
    if (ctx.isSensitivePath(resolved)) {
      // handle sensitive path
    }
  }

  return { content: "result" };
};
```

#### ToolContext API

| Property | Type | Description |
|----------|------|-------------|
| `sandboxPaths` | `string[]` | Resolved sandbox paths the tool is allowed to access |
| `cwd` | `string` | Current working directory |
| `validatePath(path)` | `(path: string) => string` | Validates path against sandbox. Returns resolved path or throws. |
| `warnSensitive(path)` | `(path: string) => void` | Writes warning to stderr if path is sensitive. |
| `isSensitivePath(path)` | `(path: string) => boolean` | Returns true if path matches sensitive patterns. |

**Note:** `__context` is optional. Tools that don't access the filesystem don't need it.

### Approval and Mtime Tracking

Custom tools follow the same approval system as built-in tools. The harness tracks the modification time of **all files** in the tool directory. If any file changes (including supporting files), the tool requires re-approval.

### Complete Example

```
.denpa/tools/grep/
  tool.json
  handler.ts
```

**tool.json:**
```json
{
  "name": "grep",
  "description": "Search file contents using regex pattern.",
  "parameters": {
    "type": "object",
    "properties": {
      "pattern": {
        "type": "string",
        "description": "Regex pattern to search for"
      },
      "path": {
        "type": "string",
        "description": "Directory to search in"
      },
      "include": {
        "type": "string",
        "description": "File glob pattern to filter (e.g., '*.ts')"
      }
    },
    "required": ["pattern"]
  }
}
```

**handler.ts:**
```typescript
import type { ToolResult, ToolContext } from "denpa-harness-lite/src/agent/tool/exports";
import { readdirSync, readFileSync } from "node:fs";

export default async (args: Record<string, unknown>): Promise<ToolResult> => {
  const pattern = args.pattern as string;
  const path = (args.path as string) || ".";
  const ctx = args.__context as ToolContext | undefined;

  if (ctx) {
    ctx.validatePath(path);
  }

  const regex = new RegExp(pattern, "u");
  const results: string[] = [];

  const scan = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile()) {
        try {
          const content = readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  };

  scan(path);
  return { content: results.length ? results.join("\n") : "(no matches)" };
};
```
