import type { APIClient } from "../api/client";
import type { Session } from "../agent/session";
import type { StatsDB } from "../stats/db";
import type { ToolRegistry } from "../agent/tool/registry";
import type { InternalToolDefinition } from "../agent/tool/internal";
import { executeToolLoop } from "../agent/tool-loop";
import type { OutputVisibilityConfig } from "../config/types";
import { ANSI, bold, wrapFgRgb } from "../terminal/ansi";
import { CHARS } from "../terminal/special-chars";
import { formatDuration } from "../utils/string-formatter";

export interface CLIOptions {
  showThinking?: boolean;
  showToolResults?: boolean;
}
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

export const runCLI = async (
  message: string,
  client: APIClient,
  session: Session,
  statsDB: StatsDB,
  config: OutputVisibilityConfig,
  tools?: InternalToolDefinition[],
  toolRegistry?: ToolRegistry,
): Promise<void> => {
  const startTime = Date.now();
  session.addMessage("user", message);

  try {
    const fullResponse = await executeToolLoop(
      client,
      session,
      toolRegistry!,
      tools ?? [],
      {
        onToken: (token) => {
          process.stdout.write(token);
        },
      },
    );

    session.addMessage("assistant", fullResponse);
    recordStats(startTime, client, session, fullResponse, statsDB);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(red(`✗ ${message}`));
    process.exit(1);
  }
};

const red = (text: string): string => `\x1b[31m${text}\x1b[0m`;
