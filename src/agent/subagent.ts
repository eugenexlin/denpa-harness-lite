import type { Message, APIStats } from "../api/types";
import type { InternalToolDefinition } from "../agent/tool/internal";
import type { APIClient } from "../api/client";
import type { ToolRegistry } from "../agent/tool/registry";
import { createSession } from "./session";
import { executeToolLoop } from "./tool-loop";

export type SubagentStatus = "pending" | "running" | "complete" | "cancelled";

export interface SubagentResult {
  content: string;
  stats: APIStats;
  status: SubagentStatus;
}

export interface Subagent {
  id: number;
  run: () => Promise<SubagentResult>;
  abort: () => void;
  getStatus: () => SubagentStatus;
}

export const createSubagent = (
  id: number,
  prompt: string,
  parentContext: Message[],
  client: APIClient,
  systemPrompt: string,
  toolRegistry: ToolRegistry,
  tools?: InternalToolDefinition[],
): Subagent => {
  const session = createSession(systemPrompt);
  const abortController = new AbortController();
  let status: SubagentStatus = "pending";
  let result: SubagentResult | null = null;

  const contextText =
    parentContext
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n") ?? "";

  if (contextText) {
    session.addMessage(
      "user",
      `Here is the conversation context:\n\n${contextText}\n\nPlease complete the following task.`,
    );
  }

  session.addMessage("user", prompt);

  return {
    id,

    run: async (): Promise<SubagentResult> => {
      status = "running";
      const startTime = Date.now();

      try {
        const content = await executeToolLoop(
          client,
          session,
          toolRegistry,
          tools ?? [],
          {},
          abortController.signal,
        );

        const durationMs = Date.now() - startTime;
        const tokensIn = session.getMessages().reduce((sum, m) => sum + m.content.length, 0);
        const tokensOut = content.length;

        result = {
          content,
          stats: {
            model: client.getModel(),
            tokensIn: Math.ceil(tokensIn / 4),
            tokensOut: Math.ceil(tokensOut / 4),
            durationMs,
          },
          status: "complete",
        };
        status = "complete";
      } catch (err) {
        if (abortController.signal.aborted) {
          status = "cancelled";
          result = {
            content: "[agent cancelled]",
            stats: {
              model: client.getModel(),
              tokensIn: 0,
              tokensOut: 0,
              durationMs: 0,
            },
            status: "cancelled",
          };
        } else {
          status = "cancelled";
          result = {
            content: `[error: ${err instanceof Error ? err.message : String(err)}]`,
            stats: {
              model: client.getModel(),
              tokensIn: 0,
              tokensOut: 0,
              durationMs: 0,
            },
            status: "cancelled",
          };
        }
      }

      return result!;
    },

    abort: (): void => {
      abortController.abort();
      status = "cancelled";
    },

    getStatus: (): SubagentStatus => status,
  };
};
