import type { Message, ToolDefinition, APIStats } from "./types";

export interface APIClient {
  getModel: () => string;
  updateModel: (model: string) => void;
  chatStream: (
    messages: Message[],
    tools?: ToolDefinition[],
    onToken?: (token: string) => void,
    signal?: AbortSignal,
  ) => Promise<APIStats>;
  chatComplete: (
    messages: Message[],
    tools?: ToolDefinition[],
    signal?: AbortSignal,
  ) => Promise<{ content: string; stats: APIStats }>;
}

export const createAPIClient = (baseUrl: string, apiKey: string, model: string): APIClient => {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
  let currentModel = model;

  const buildPayload = (
    messages: Message[],
    tools?: ToolDefinition[],
    stream = false,
  ): import("./types").ChatRequest => ({
    model: currentModel,
    messages,
    tools: tools?.length ? tools : undefined,
    stream,
  });

  const parseStream = async function* (
    response: Response,
  ): AsyncIterable<string> {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

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
          if (data === "[DONE]") return;

          try {
            const chunk = JSON.parse(data) as import("./types").StreamChunk;
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) yield content;
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
      tools?: ToolDefinition[],
      onToken?: (token: string) => void,
      signal?: AbortSignal,
    ): Promise<APIStats> => {
      const startTime = Date.now();
      let fullContent = "";

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

      for await (const token of parseStream(response)) {
        fullContent += token;
        onToken?.(token);
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
      };
    },

    chatComplete: async (
      messages: Message[],
      tools?: ToolDefinition[],
      signal?: AbortSignal,
    ): Promise<{ content: string; stats: APIStats }> => {
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
      const tokensIn = json.usage?.prompt_tokens ?? 0;
      const tokensOut = json.usage?.completion_tokens ?? 0;
      const durationMs = Date.now() - startTime;

      return {
        content,
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
