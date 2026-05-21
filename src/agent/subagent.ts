import type { Message, ToolDefinition, APIStats } from "../api/types";
import type { APIClient } from "../api/client";
import { createSession } from "./session";

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
  tools?: ToolDefinition[],
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

      try {
        const { content, stats } = await (client as any).chatComplete(
          session.getMessages(),
          tools,
          abortController.signal,
        );

        result = {
          content,
          stats,
          status: "complete",
        };
        status = "complete";
      } catch (err) {
        if (abortController.signal.aborted) {
          status = "cancelled";
          result = {
            content: "[agent cancelled]",
            stats: {
              model: (client as any).getModel(),
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
              model: (client as any).getModel(),
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
