import type { APIClient } from "../api/client";
import type { Session } from "../agent/session";
import type { StatsDB } from "../stats/db";
import type { ToolRegistry } from "../agent/tool/registry";
import type { InternalToolDefinition } from "../agent/tool/internal";
import { logFile } from "../debug-logger";
import { executeToolLoop } from "../agent/tool-loop";
import { createCallbacks, recordStats, formatDuration } from "../agent/tool-loop-callbacks";

export interface CLIOptions {
  showThinking?: boolean;
}

export const runCLI = async (
  message: string,
  client: APIClient,
  session: Session,
  statsDB: StatsDB,
  tools?: InternalToolDefinition[],
  toolRegistry?: ToolRegistry,
  options: CLIOptions = {},
): Promise<void> => {
  const startTime = Date.now();
  session.addMessage("user", message);

  try {
    logFile(session.getHistory());

    const callbacks = createCallbacks({
      showThinking: options.showThinking ?? false,
      onToken: (token) => {
        process.stdout.write(token);
      },
    });

    const fullResponse = await executeToolLoop(
      client,
      session,
      toolRegistry!,
      tools ?? [],
      callbacks,
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
