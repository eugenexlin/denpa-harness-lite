import type { ScreenManager } from "../terminal/screen";
import type { InputManager } from "../terminal/input";
import type { APIClient } from "../api/client";
import type { Session } from "../agent/session";
import type { SubagentManager } from "../agent/subagent-manager";
import type { ToolRegistry } from "../agent/tool/registry";
import type { StatsDB } from "../stats/db";
import type { ToolDefinition } from "../api/types";
import type { Message } from "../api/types";
import {
  gray,
  red,
  green,
  bold,
  cyan,
  separator,
  spinner,
  ANSI_STYLE,
} from "../terminal/ansi";
import { outputBuffer } from "./output-buffer";

export type PanelState =
  | { type: "idle" }
  | { type: "typing"; text: string }
  | { type: "streaming"; model: string; startTime: number }
  | {
      type: "agent-running";
      agents: { id: number; status: string; duration: number }[];
    }
  | {
      type: "agent-complete";
      results: { id: number; content: string; duration: number }[];
    }
  | { type: "error"; message: string };

export interface REPL {
  run: () => Promise<void>;
  stop: () => void;
}

export const createREPL = (
  screen: ScreenManager,
  input: InputManager,
  client: APIClient,
  session: Session,
  agentManager: SubagentManager,
  toolRegistry: ToolRegistry,
  statsDB: StatsDB,
): REPL => {
  let panelState: PanelState = { type: "idle" };
  let running = false;
  const slashCommands = new Map<string, (args: string) => Promise<string>>();

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
    }
    return `${seconds}s`;
  };

  const setPanelState = (state: PanelState): void => {
    panelState = state;
  };

  const registerSlashCommands = (): void => {
    slashCommands.set("model", async (args) => {
      if (!args.trim()) {
        return "Usage: /model <model-name>";
      }
      client.updateModel(args.trim());
      return `Model set to: ${args.trim()}`;
    });

    slashCommands.set("clear", async () => {
      session.clear();
      screen.clearBuffer();
      return "Session cleared.";
    });

    slashCommands.set("agents", async () => {
      const running = agentManager.getRunning();
      const completed = agentManager.getCompleted();
      let text = "";
      if (running.length > 0) {
        text += `Running: ${running.map((a) => `agent-${a.id}`).join(", ")}\n`;
      }
      if (completed.length > 0) {
        text += `Completed: ${completed.map((a) => `agent-${a.id}`).join(", ")}\n`;
      }
      return text.trim() || "No agents running.";
    });

    slashCommands.set("config", async () => {
      return `Model: ${client.getModel()}\nSandbox: ${toolRegistry.list().join(", ")}`;
    });

    slashCommands.set("stats", async () => {
      const today = statsDB.getToday();
      if (!today) {
        return "No stats recorded yet.";
      }
      return `Today: ${today.request_count} requests, ${today.tokens_in + today.tokens_out} tokens, ${formatDuration(today.total_duration_ms)}`;
    });

    slashCommands.set("tools", async () => {
      return `Available tools: ${toolRegistry.list().join(", ")}`;
    });

    slashCommands.set("exit", async () => {
      process.exit(0);
      return "";
    });

    slashCommands.set("test", async () => {
      return ["test1", "test2", "test3", "test4", "test5"].join("\n");
    });

    slashCommands.set("help", async () => {
      return [
        "Slash commands:",
        "  /model <name>  - Switch model",
        "  /clear         - Clear session history",
        "  /agent <prompt>- Spawn subagent",
        "  /agents        - List agents",
        "  /config        - Show current config",
        "  /stats         - Show session stats",
        "  /tools         - List available tools",
        "  /test          - Output test lines",
        "  /exit          - Exit REPL",
        "  /help          - Show this help",
      ].join("\n");
    });
  };

  const updatePanel = (): void => {
    switch (panelState.type) {
      case "streaming": {
        const elapsed = Date.now() - panelState.startTime;
        const line = `${panelState.model} | ${formatDuration(elapsed)} | tokens: -/-`;
        outputBuffer.setPanel([
          `${gray("> submitted")}`,
          gray(line),
          { type: "full-width-rule" },
        ]);
        break;
      }

      case "agent-running": {
        const lines: (string | { type: "full-width-rule" })[] = [];
        lines.push({ type: "full-width-rule" });
        lines.push(
          ...panelState.agents.map(
            (a) =>
              `[agent-${a.id}] ${a.status}... ${formatDuration(a.duration)}`,
          ),
        );
        lines.push(gray("Ctrl+C to cancel"));
        lines.push({ type: "full-width-rule" });
        outputBuffer.setPanel(lines);
        break;
      }

      case "agent-complete": {
        const lines: (string | { type: "full-width-rule" })[] = [];
        lines.push({ type: "full-width-rule" });
        lines.push(
          ...panelState.results.map(
            (r) =>
              `[agent-${r.id}] done (${formatDuration(r.duration)}) | ${r.content.slice(0, 60)}${r.content.length > 60 ? "..." : ""}`,
          ),
        );
        lines.push({ type: "full-width-rule" });
        outputBuffer.setPanel(lines);
        break;
      }

      case "error":
        outputBuffer.setPanel([
          red(`✗ ${panelState.message}`),
          { type: "full-width-rule" },
        ]);
        break;
    }
  };

  const handleInput = async (input: string): Promise<string> => {
    if (input.startsWith("/")) {
      const parts = input.trim().split(/\s+/);
      const cmd = parts[0]?.slice(1) ?? "";
      const args = parts.slice(1).join(" ");

      const handler = slashCommands.get(cmd);
      if (handler) {
        return await handler(args);
      }

      return `Unknown command: /${cmd}. Type /help for available commands.`;
    }

    if (input.startsWith("/agent ")) {
      return handleAgent(input.slice(7));
    }

    return handleMessage(input);
  };

  const handleMessage = async (input: string): Promise<string> => {
    session.addMessage("user", input);
    setPanelState({
      type: "streaming",
      model: client.getModel(),
      startTime: Date.now(),
    });
    updatePanel();

    let fullResponse = "";
    const startTime = Date.now();

    try {
      const stats = await client.chatStream(
        session.getMessages(),
        undefined,
        (token) => {
          fullResponse += token;
          outputBuffer.scroll(token);
        },
      );

      const duration = Date.now() - startTime;
      statsDB.recordRequest(duration, stats.tokensIn, stats.tokensOut);

      session.addMessage("assistant", fullResponse);

      return `${gray(`\n${client.getModel()} | ${formatDuration(duration)} | in:${stats.tokensIn} out:${stats.tokensOut}`)}`;
    } catch (err) {
      const duration = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      return red(`✗ ${message}`);
    }
  };

  const handleAgent = async (prompt: string): Promise<string> => {
    session.addMessage("user", `/agent ${prompt}`);

    const agent = agentManager.spawn(prompt, session.getMessages());
    setPanelState({
      type: "agent-running",
      agents: [{ id: agent.id, status: "running", duration: 0 }],
    });
    updatePanel();

    const result = await agent.run();

    session.addMessage("assistant", result.content);

    setPanelState({
      type: "agent-complete",
      results: [
        {
          id: agent.id,
          content: result.content,
          duration: result.stats.durationMs,
        },
      ],
    });
    updatePanel();

    statsDB.recordRequest(
      result.stats.durationMs,
      result.stats.tokensIn,
      result.stats.tokensOut,
    );

    return `[agent-${agent.id}] ${result.content}`;
  };

  registerSlashCommands();

  return {
    run: async (): Promise<void> => {
      running = true;

      await outputBuffer.init();
      input.start();

      const model = client.getModel();
      outputBuffer.scroll(bold("denpa") + ` — ${gray(`model: ${model}`)}`);
      outputBuffer.scroll("\n");
      outputBuffer.scroll(
        gray("Type a message or /help for commands. Ctrl+C to cancel."),
      );
      outputBuffer.scroll("\n");
      outputBuffer.scroll("\n");

      while (running) {
        try {
          const userInput = await input.submit();
          if (input.wasCancelled()) {
            continue;
          }

          if (userInput.trim()) {
            const result = await handleInput(userInput);
            if (result) {
              outputBuffer.scroll("\n");
              outputBuffer.scroll(result);
              outputBuffer.scroll("\n");
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setPanelState({ type: "error", message });
          updatePanel();
          outputBuffer.scroll(red(`✗ ${message}`));
          outputBuffer.scroll("\n");
        }
      }

      input.stop();
    },

    stop: (): void => {
      running = false;
      input.stop();
      agentManager.abortAll();
    },
  };
};
