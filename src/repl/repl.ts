import { createInputManager, type InputManager } from "../terminal/input";
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
  bold,
  clearFromCursor,
} from "../terminal/ansi";
import {
  createOutputBuffer,
  FULL_WIDTH_RULE,
  type PanelLine,
} from "./output-buffer";

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

export interface Repl {
  run: () => Promise<void>;
  stop: () => void;
}

export const createRepl = (
  client: APIClient,
  session: Session,
  agentManager: SubagentManager,
  toolRegistry: ToolRegistry,
  statsDB: StatsDB,
): Repl => {
  let userInput: string = "";
  let userInputFormatted: string = "";

  const outputBuffer = createOutputBuffer();

  let terminateMe: () => void = () => {};

  const waitForTermination = () => {
    return new Promise<void>((resolve) => {
      // SIGINT is triggered by Ctrl+C
      process.on("SIGINT", () => {
        console.log("\nReceived SIGINT (Ctrl+C). Shutting down...");
        resolve();
      });

      // SIGTERM is often sent by process managers or Docker
      process.on("SIGTERM", () => {
        console.log("Received SIGTERM. Shutting down...");
        resolve();
      });

      terminateMe = () => {
        resolve();
      };
    });
  };

  const rerenderPanel = (): void => {
    if (userInput.startsWith("/")) {
      outputBuffer.setPanel(renderSlashMenu());
      return;
    }

    outputBuffer.setPanel([
      FULL_WIDTH_RULE,
      `${gray("> ")}${userInputFormatted}`,
      FULL_WIDTH_RULE,
    ]);
  };

  const inputManager = createInputManager({
    onUserInputUpdate: (value: string, formattedValue: string): void => {
      userInput = value;
      userInputFormatted = formattedValue;
      rerenderPanel();
    },
    onSubmit: (value: string) => {
      handleInput(value);
    },
    onTerminate: () => {
      outputBuffer.scroll("terminate\n");
      terminateMe();
    },
  });

  let panelState: PanelState = { type: "idle" };
  let running = false;
  const slashCommands = new Map<string, (args: string) => Promise<string>>();
  const slashCommandDescriptions = new Map<string, string>([
    ["model", "<name>  - Switch model"],
    ["clear", "         - Clear session history"],
    ["agent", "<prompt> - Spawn subagent"],
    ["agents", "        - List agents"],
    ["config", "        - Show current config"],
    ["stats", "         - Show session stats"],
    ["tools", "         - List available tools"],
    ["test", "          - Output test lines"],
    ["exit", "          - Exit the REPL"],
    ["help", "          - Show this help"],
  ]);

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

  const renderSlashMenu = (): PanelLine[] => {
    const lines: PanelLine[] = [];
    lines.push(FULL_WIDTH_RULE);
    lines.push(`${gray("> ")}${userInputFormatted}`);
    lines.push(FULL_WIDTH_RULE);

    const filter = userInput.slice(1);
    const filtered = Array.from(slashCommands.entries())
      .filter(
        ([cmd]) =>
          !filter || cmd.toLowerCase().startsWith(filter.toLowerCase()),
      )
      .slice(0, 10);

    for (const [cmd] of filtered) {
      const desc = slashCommandDescriptions.get(cmd) ?? "";
      lines.push(`  /${cmd}${desc}`);
    }

    return lines;
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
      terminateMe();
      return "";
    });

    slashCommands.set("test", async () => {
      return ["test1", "test2", "test3", "test4", "test5"].join("\n");
    });

    slashCommands.set("agent", async (args) => {
      if (!args.trim()) {
        return "Usage: /agent <prompt>";
      }
      return await handleAgent(args);
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
          FULL_WIDTH_RULE,
          `${gray("> submitted")}`,
          gray(line),
          FULL_WIDTH_RULE,
        ]);
        break;
      }

      case "agent-running": {
        const lines: PanelLine[] = [];
        lines.push(FULL_WIDTH_RULE);
        lines.push(
          ...panelState.agents.map(
            (a) =>
              `[agent-${a.id}] ${a.status}... ${formatDuration(a.duration)}`,
          ),
        );
        lines.push(gray("Ctrl+C to cancel"));
        lines.push(FULL_WIDTH_RULE);
        outputBuffer.setPanel(lines);
        break;
      }

      case "agent-complete": {
        const lines: PanelLine[] = [];
        lines.push(FULL_WIDTH_RULE);
        lines.push(
          ...panelState.results.map(
            (r) =>
              `[agent-${r.id}] done (${formatDuration(r.duration)}) | ${r.content.slice(0, 60)}${r.content.length > 60 ? "..." : ""}`,
          ),
        );
        lines.push(FULL_WIDTH_RULE);
        outputBuffer.setPanel(lines);
        break;
      }

      case "error":
        outputBuffer.setPanel([
          FULL_WIDTH_RULE,
          red(`✗ ${panelState.message}`),
          FULL_WIDTH_RULE,
        ]);
        break;
    }
  };

  const handleInput = async (input: string): Promise<void> => {
    if (input.startsWith("/")) {
      return handleSlashCommand(input);
    }

    return handleSendToLlm(input);
  };

  const handleSlashCommand = async (input: string): Promise<void> => {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0]?.slice(1) ?? "";
    const args = parts.slice(1).join(" ");

    const handler = slashCommands.get(cmd);
    if (handler) {
      const result = await handler(args);
      outputBuffer.scroll(result);
    }
    outputBuffer.scroll(
      `Unknown command: /${cmd}. Type /help for available commands.`,
    );
    return;
  };

  const handleSendToLlm = async (input: string): Promise<void> => {
    session.addMessage("user", input);
    setPanelState({
      type: "streaming",
      model: client.getModel(),
      startTime: Date.now(),
    });

    let fullResponse = "";
    const startTime = Date.now();
    let tokensIn = 0;
    let tokensOut = 0;

    try {
      const stats = await client.chatStream(
        session.getMessages(),
        undefined,
        (token) => {
          fullResponse += token;
          outputBuffer.scroll(token);
        },
      );
      outputBuffer.scroll("\n");

      const duration = Date.now() - startTime;
      statsDB.recordRequest(duration, stats.tokensIn, stats.tokensOut);
      tokensIn = stats.tokensIn;
      tokensOut = stats.tokensOut;

      session.addMessage("assistant", fullResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputBuffer.scroll(red(`✗ ${message}`));
    }

    const duration = Date.now() - startTime;
    let infoBuffer = `\n${formatDuration(duration)}`;
    if (tokensIn > 0) {
      infoBuffer += ` | in:${tokensIn}`;
    }
    if (tokensOut > 0) {
      infoBuffer += ` | out:${tokensOut}`;
    }
    infoBuffer += "\n";
    outputBuffer.scroll(gray(infoBuffer));
  };

  const handleAgent = async (prompt: string): Promise<string> => {
    session.addMessage("user", `/agent ${prompt}`);

    const agent = agentManager.spawn(prompt, session.getMessages());
    setPanelState({
      type: "agent-running",
      agents: [{ id: agent.id, status: "running", duration: 0 }],
    });

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

      await outputBuffer.init(inputManager);
      inputManager.start();

      const model = client.getModel();
      outputBuffer.scroll(bold("denpa") + ` — ${gray(`model: ${model}`)}`);
      outputBuffer.scroll("\n");
      outputBuffer.scroll(
        gray("Type a message or /help for commands. Ctrl+C to cancel."),
      );
      outputBuffer.scroll("\n");
      outputBuffer.scroll("\n");

      await waitForTermination();

      process.stdout.write(clearFromCursor());
      running = false;
      inputManager.stop();
      agentManager.abortAll();
      process.exit(0);
    },

    stop: (): void => {
      terminateMe();
    },
  };
};
