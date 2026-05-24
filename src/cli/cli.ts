import type { APIClient } from "../api/client";
import type { Session } from "../agent/session";
import type { StatsDB } from "../stats/db";
import { fgGray, bold } from "../terminal/ansi";
import type { ToolDefinition } from "../api/types";

export const runCLI = async (
  message: string,
  client: APIClient,
  session: Session,
  statsDB: StatsDB,
  tools?: ToolDefinition[],
): Promise<void> => {
  const startTime = Date.now();
  session.addMessage("user", message);

  let fullResponse = "";

  try {
    const stats = await client.chatStream(
      session.getHistory(),
      tools,
      (token) => {
        process.stdout.write(token);
        fullResponse += token;
      },
    );

    const duration = Date.now() - startTime;
    session.addMessage("assistant", fullResponse);
    statsDB.recordRequest(duration, stats.tokensIn, stats.tokensOut);

    console.log("");
    console.log(
      fgGray(
        `\n${bold(client.getModel())} | ${formatDuration(duration)} | in:${stats.tokensIn} out:${stats.tokensOut}\n`,
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(red(`✗ ${message}`));
    process.exit(1);
  }
};

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }
  return `${seconds}s`;
};

const red = (text: string): string => `\x1b[31m${text}\x1b[0m`;
