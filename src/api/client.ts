import type { Message, InternalToolCall } from "./types";
import type { InternalToolDefinition } from "../agent/tool/internal";
import { openAIFormatter } from "../agent/tool/formatter";
import type { APIStats } from "./types";

export interface APIClient {
  getModel: () => string;
  updateModel: (model: string) => void;
  chatStream: (
    messages: Message[],
    tools?: InternalToolDefinition[],
    onToken?: (token: string) => void,
    signal?: AbortSignal,
    onThinking?: (chunk: string) => void,
    onThinkingEnd?: (durationMs: number) => void,
  ) => Promise<APIStats & { toolCalls?: InternalToolCall[] }>;
  chatComplete: (
    messages: Message[],
    tools?: InternalToolDefinition[],
    signal?: AbortSignal,
  ) => Promise<{ content: string; toolCalls?: InternalToolCall[]; stats: APIStats }>;
}

export interface APIClientOptions {
  formatter?: typeof openAIFormatter;
}

export const createAPIClient = (
  baseUrl: string,
  apiKey: string,
  model: string,
  options: APIClientOptions = {},
): APIClient => {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
  let currentModel = model;
  const formatter = options.formatter ?? openAIFormatter;

  const buildPayload = (
    messages: Message[],
    tools?: InternalToolDefinition[],
    stream = false,
  ): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      model: currentModel,
      messages: formatter.formatMessages(messages),
      stream,
    };
    if (tools?.length) {
      payload.tools = formatter.formatTools(tools);
    }
    return payload;
  };

  type StreamEvent =
    | { type: "thinking"; text: string }
    | { type: "content"; text: string }
    | { type: "tool_call"; toolCall: InternalToolCall };

  const parseStream = async function* (
    response: Response,
  ): AsyncIterable<StreamEvent> {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    const pendingToolCalls = new Map<number, { id?: string; name?: string; argsBuffer: string }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            for (const tc of pendingToolCalls.values()) {
              if (tc.id && tc.name) {
                yield { type: "tool_call", toolCall: { id: tc.id, name: tc.name, arguments: (() => { try { return JSON.parse(tc.argsBuffer) as Record<string, unknown>; } catch { return {}; } })() } };
              }
            }
            pendingToolCalls.clear();
            return;
          }

          try {
            const chunk = JSON.parse(data) as import("./types").StreamChunk;
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.reasoning_content) yield { type: "thinking", text: delta.reasoning_content };
            if (delta?.content) yield { type: "content", text: delta.content };
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                const existing = pendingToolCalls.get(idx) ?? { id: undefined, name: undefined, argsBuffer: "" };
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments) existing.argsBuffer += tc.function.arguments;
                pendingToolCalls.set(idx, existing);
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  const estimateTokens = (text: string): number =>
    Math.max(1, Math.ceil(text.length / 4));

  return {
    getModel: (): string => currentModel,

    updateModel: (model: string): void => {
      currentModel = model;
    },

    chatStream: async (
      messages: Message[],
      tools?: InternalToolDefinition[],
      onToken?: (token: string) => void,
      signal?: AbortSignal,
      onThinking?: (chunk: string) => void,
      onThinkingEnd?: (durationMs: number) => void,
    ): Promise<APIStats & { toolCalls?: InternalToolCall[] }> => {
      const startTime = Date.now();
      let fullContent = "";
      let isThinking = false;
      let thinkingStart = 0;
      const collectedToolCalls: InternalToolCall[] = [];

      const processEvent = (event: StreamEvent) => {
        if (event.type === "thinking") {
          if (!isThinking) {
            isThinking = true;
            thinkingStart = Date.now();
            onThinking?.("");
          }
          onThinking?.(event.text);
        } else if (event.type === "tool_call") {
          collectedToolCalls.push(event.toolCall);
        } else {
          // content
          if (isThinking) {
            const duration = Date.now() - thinkingStart;
            onThinkingEnd?.(duration);
            isThinking = false;
          }
          fullContent += event.text;
          onToken?.(event.text);
        }
      };

      const payload = buildPayload(messages, tools, true);
      const url = `${cleanBaseUrl}/chat/completions`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `API error ${response.status}: ${errorBody.slice(0, 200)}`,
        );
      }

      for await (const event of parseStream(response)) {
        processEvent(event);
      }

      if (isThinking) {
        const duration = Date.now() - thinkingStart;
        onThinkingEnd?.(duration);
      }

      const tokensIn = estimateTokens(
        messages.map((m) => m.content).join("\n"),
      );
      const tokensOut = estimateTokens(fullContent);
      const durationMs = Date.now() - startTime;

      return {
        model: currentModel,
        tokensIn,
        tokensOut,
        durationMs,
        toolCalls: collectedToolCalls.length ? collectedToolCalls : undefined,
      };
    },

    chatComplete: async (
      messages: Message[],
      tools?: InternalToolDefinition[],
      signal?: AbortSignal,
    ): Promise<{ content: string; toolCalls?: InternalToolCall[]; stats: APIStats }> => {
      const startTime = Date.now();

      const payload = buildPayload(messages, tools, false);
      const url = `${cleanBaseUrl}/chat/completions`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `API error ${response.status}: ${errorBody.slice(0, 200)}`,
        );
      }

      const json = (await response.json()) as import("./types").ChatCompletionResponse;
      const content = json.choices?.[0]?.message?.content ?? "";
      const rawToolCalls = json.choices?.[0]?.message?.tool_calls;
      const toolCalls = rawToolCalls ? formatter.parseToolCalls(rawToolCalls) : undefined;
      const tokensIn = json.usage?.prompt_tokens ?? 0;
      const tokensOut = json.usage?.completion_tokens ?? 0;
      const durationMs = Date.now() - startTime;

      return {
        content,
        toolCalls: toolCalls?.length ? toolCalls : undefined,
        stats: {
          model: currentModel,
          tokensIn,
          tokensOut,
          durationMs,
        },
      };
    },
  };
};
