import type { APIClient } from "../api/client";
import type { Session } from "./session";
import type { StatsDB } from "../stats/db";
import type { ToolResult } from "./tool/internal";
import { ANSI, bold, wrapFgRgb } from "../terminal/ansi";
import { CHARS } from "../terminal/special-chars";

export const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }
  return `${seconds}s`;
};

export interface CallbackOptions {
  showThinking?: boolean;
  onToken?: (token: string) => void;
  onThinking?: (chunk: string) => void;
  onThinkingEnd?: (durationMs: number) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: ToolResult) => void;
}

export const createCallbacks = (
  options: CallbackOptions = {},
): CallbackOptions => {
  const { showThinking = false } = options;

  let isThinking = false;

  return {
    ...options,
    onThinking: (chunk: string) => {
      if (!isThinking) {
        isThinking = true;
      }
      options.onThinking?.(chunk);
    },
    onThinkingEnd: (durationMs: number) => {
      const seconds = Math.max(1, Math.ceil(durationMs / 1000));
      const formatTime = seconds + "s";
      if (showThinking) {
        options.onToken?.("\n");
      }
      options.onToken?.(
        wrapFgRgb(ANSI.color_ref.thinking, `Thought for ${formatTime}\n\n`),
      );
      isThinking = false;
      options.onThinkingEnd?.(durationMs);
    },
    onToolCall: (name: string, args: Record<string, unknown>) => {
      const argStr = Object.entries(args)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(", ");
      options.onToken?.(
        `\n${wrapFgRgb(ANSI.color.amber700, `🔧 ${name}(${argStr})`)}\n`,
      );
      options.onToolCall?.(name, args);
    },
    onToolResult: (name: string, result: ToolResult) => {
      const prefix = result.isError
        ? wrapFgRgb(ANSI.color.red500, "✗")
        : wrapFgRgb(ANSI.color.green500, "✓");
      options.onToken?.(`${prefix} ${name}: ${result.content}\n`);
      options.onToolResult?.(name, result);
    },
  };
};

export const recordStats = (
  startTime: number,
  client: APIClient,
  session: Session,
  fullResponse: string,
  statsDB: StatsDB,
): void => {
  const duration = Date.now() - startTime;
  const tokensIn = session
    .getMessages()
    .reduce((sum, m) => sum + m.content.length, 0);
  const tokensOut = fullResponse.length;
  statsDB.recordRequest(
    duration,
    Math.ceil(tokensIn / 4),
    Math.ceil(tokensOut / 4),
  );

  console.log("");
  console.log(
    wrapFgRgb(
      ANSI.color.gray500,
      `\n${bold(client.getModel())} ${CHARS.separator} ${formatDuration(duration)} ${CHARS.separator} in:${Math.ceil(tokensIn / 4)} ${CHARS.separator} out:${Math.ceil(tokensOut / 4)}\n`,
    ),
  );
};
