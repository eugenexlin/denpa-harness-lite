import type { APIClient } from "../api/client";
import type { Session } from "./session";
import type { ToolRegistry } from "./tool/registry";
import type { ToolResult } from "./tool/internal";
import type { InternalToolDefinition, InternalToolCall } from "./tool/internal";

export interface ToolLoopCallbacks {
  onToken?: (token: string) => void;
  onThinking?: (chunk: string) => void;
  onThinkingEnd?: (durationMs: number) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: ToolResult) => void;
}

export const executeToolLoop = async (
  client: APIClient,
  session: Session,
  toolRegistry: ToolRegistry,
  tools: InternalToolDefinition[],
  callbacks: ToolLoopCallbacks = {},
  signal?: AbortSignal,
): Promise<string> => {
  const { onToken, onThinking, onThinkingEnd, onToolCall, onToolResult } = callbacks;
  let fullContent = "";

  while (true) {
    if (signal?.aborted) {
      break;
    }

    let iterationContent = "";

    const result = await client.chatStream(
      session.getHistory(),
      tools,
      (token) => {
        iterationContent += token;
        onToken?.(token);
      },
      signal,
      onThinking,
      onThinkingEnd,
    );

    fullContent += iterationContent;

    if (!result.toolCalls?.length) {
      break;
    }

    session.addMessage("assistant", fullContent);

    for (const tc of result.toolCalls) {
      if (signal?.aborted) break;

      onToolCall?.(tc.name, tc.arguments);

      const toolResult = await toolRegistry.execute(tc.name, tc.arguments);

      onToolResult?.(tc.name, toolResult);

      session.addMessage("tool", toolResult.content, { tool_call_id: tc.id });
    }
  }

  return fullContent;
};
