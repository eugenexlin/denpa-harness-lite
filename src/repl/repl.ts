import { createInputManager, type InputManager } from "../terminal/input";
import type { APIClient } from "../api/client";
import type { Session } from "../agent/session";
import type { SubagentManager } from "../agent/subagent-manager";
import type { ToolRegistry, ToolApprovalCallback } from "../agent/tool/registry";
import type { StatsDB } from "../stats/db";
import type { ToolDefinition } from "../api/types";
import type { Message } from "../api/types";
import type { ToolDefinition as ToolDef } from "../agent/tool/types";
import {
  fgGray,
  fgRed,
  fgYellow,
  bold,
  clearFromCursor,
  ANSI_STYLE,
  ESC,
  clearLine,
} from "../terminal/ansi";
import { wrapText } from "../terminal/wrap";
import {
  createOutputBuffer,
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

export interface ReplOptions {
  showThinking?: boolean;
  onToolPending?: ToolApprovalCallback;
}

export const createRepl = (
  client: APIClient,
  session: Session,
  agentManager: SubagentManager,
  toolRegistry: ToolRegistry,
  statsDB: StatsDB,
  options: ReplOptions = {},
): Repl => {
  const showThinking = options.showThinking ?? false;
  const onToolPending = options.onToolPending;
  let userInput: string = "";
  let userInputWithAnsiCursor: string = "";

  const outputBuffer = createOutputBuffer();

  let terminateMe: () => void = () => { };

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
    const panelLines: PanelLine[] = formatUserInput(userInputWithAnsiCursor)

    if (userInput.startsWith("/")) {
      panelLines.push(...renderSlashMenu())
    }

    outputBuffer.setPanel(panelLines);
  };

  const inputManager = createInputManager({
    onUserInputUpdate: (value: string, formattedValue: string): void => {
      userInput = value;
      userInputWithAnsiCursor = formattedValue;
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

  const promptToolApproval: ToolApprovalCallback = async (
    name: string,
    definition: ToolDef,
  ): Promise<"approved" | "denied"> => {
    const fn = definition.function;
    outputBuffer.scroll(fgYellow(`\n⚠ Tool '${name}' requires approval:\n`));
    outputBuffer.scroll(`  ${fn.description}\n`);
    const params = Object.entries(fn.parameters.properties)
      .map(([k, v]) => `${k} (${v.type})`)
      .join(", ");
    if (params) {
      outputBuffer.scroll(`  Params: ${params}\n`);
    }
    outputBuffer.scroll("Approve? [y/N]: ");

    return new Promise((resolve) => {
      const onData = (data: Buffer) => {
        const char = data.toString().trim().toLowerCase();
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode(true);
        if (char === "y" || char === "yes") {
          outputBuffer.scroll("approved\n");
          resolve("approved");
        } else {
          outputBuffer.scroll("denied\n");
          resolve("denied");
        }
      };
      process.stdin.setRawMode(false);
      process.stdin.on("data", onData);
    });
  };

  const setPanelState = (state: PanelState): void => {
    panelState = state;
  };

  const renderSlashMenu = (): PanelLine[] => {
    const lines: PanelLine[] = [];

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

  const formatUserInput = (input: string): string[] => {
    const cols = process.stdout.columns || 80;
    const wrapWidth = cols - 4;
    const wrapResult = wrapText(input, 1, wrapWidth);

    const lines = [
      `${ANSI_STYLE.bg.gray900}${clearLine()}`,
      ...wrapResult.textLines.map((line, i) => `${clearLine()}${i == 0 ? "> " : "  "}${line}`),
      `${clearLine()}${ANSI_STYLE.reset}`,
    ];

    return lines;
  };

  const handleInput = async (input: string): Promise<void> => {
    outputBuffer.scroll("\n");
    outputBuffer.scroll(formatUserInput(input).join("\n") + "\n\n");

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
    } else {
      outputBuffer.scroll(
        `Unknown command: /${cmd}. Type /help for available commands.`,
      );
    }
    outputBuffer.scroll("\n");
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
    let thinkingActive = false;

    try {
      const stats = await client.chatStream(
        session.getMessages(),
        undefined,
        (token) => {
          fullResponse += token;
          outputBuffer.scroll(token);
        },
        undefined,
        (chunk) => {
          if (!thinkingActive) {
            thinkingActive = true;
            if (showThinking) {
              outputBuffer.scroll("[thinking]\n");
            }
          }
          if (showThinking && chunk) {
            outputBuffer.scroll(chunk);
          }
        },
        (durationMs) => {
          if (showThinking) {
            outputBuffer.scroll("[/thinking]\n");
          } else {
            const seconds = Math.max(1, Math.ceil(durationMs / 1000));
            outputBuffer.scroll(`[thought for ${seconds}s]\n`);
          }
          thinkingActive = false;
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
      outputBuffer.scroll(fgRed(`✗ ${message}`));
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
    outputBuffer.scroll(fgGray(infoBuffer));
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
      outputBuffer.scroll(bold("denpa") + ` — ${fgGray(`model: ${model}`)}`);
      outputBuffer.scroll("\n");
      outputBuffer.scroll(
        fgGray("Type a message or /help for commands. Ctrl+C to cancel."),
      );
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
