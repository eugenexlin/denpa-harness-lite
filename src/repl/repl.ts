import { createInputManager, type InputManager } from "../terminal/input";
import type { APIClient } from "../api/client";
import type { Session } from "../agent/session";
import type { SubagentManager } from "../agent/subagent-manager";
import type {
  ToolRegistry,
  ToolApprovalCallback,
} from "../agent/tool/registry";
import type { StatsDB } from "../stats/db";
import type { ToolPermissionState } from "../config/types";
import type { InternalToolDefinition } from "../agent/tool/internal";
import { executeToolLoop } from "../agent/tool-loop";
import { createCallbacks, formatDuration } from "../agent/tool-loop-callbacks";
import { ANSI, clearFromCursor, wrapFgRgb } from "../terminal/ansi";
import { createOutputBuffer } from "./output-buffer";
import { formatThinking } from "./format-thinking";
import {
  formatUserInputPanel,
  renderPanel,
  type PanelLine,
  type PanelMode,
} from "./panel";
import { CHARS } from "../terminal/special-chars";

export interface Repl {
  run: () => Promise<void>;
  stop: () => void;
}

export interface ReplOptions {
  showThinking?: boolean;
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
  let userInput: string = "";
  let userInputWithAnsiCursor: string = "";
  let isThinking = false;
  let isStreaming = false;
  let isReadonlyMode = true;
  let agentRunning = false;
  let panelMode: PanelMode = "input";
  let pendingToolName: string | null = null;
  let pendingToolDef: InternalToolDefinition | null = null;
  let pendingToolArgs: Record<string, unknown> | null = null;

  const outputBuffer = createOutputBuffer();

  let terminateMe: () => void = () => {};

  const waitForTermination = () => {
    return new Promise<void>((resolve) => {
      process.on("SIGINT", () => {
        console.log("\nReceived SIGINT (Ctrl+C). Shutting down...");
        resolve();
      });

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
    const panelLines = renderPanel({
      mode: panelMode,
      isStreaming,
      llmModel: client.getModel(),
      isReadonlyMode,
      isThinking,
      startTime: 0,
      userInputWithAnsiCursor,
      toolName: pendingToolName ?? undefined,
      toolDefinition: pendingToolDef ?? undefined,
      toolArgs: pendingToolArgs ?? undefined,
    });
    if (panelMode === "input" && userInput.startsWith("/")) {
      panelLines.push(...renderSlashMenu());
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

  const slashCommands = new Map<string, (args: string) => Promise<string>>();
  const slashCommandDescriptions = new Map<string, string>([
    ["model", "          - Switch model"],
    ["clear", "          - Clear session history"],
    ["agent", " <prompt> - Spawn subagent"],
    ["agents", "         - List agents"],
    ["config", "         - Show current config"],
    ["stats", "          - Show session stats"],
    ["tools", "          - List available tools"],
    ["test", "           - Output test lines"],
    ["exit", "           - Exit the REPL"],
    ["help", "           - Show this help"],
  ]);

  const promptToolApproval: ToolApprovalCallback = async (
    name: string,
    definition,
    args,
  ): Promise<ToolPermissionState> => {
    inputManager.supressInput();
    panelMode = "tool-approval";
    pendingToolName = name;
    pendingToolDef = definition;
    pendingToolArgs = args;
    rerenderPanel();

    return new Promise((resolve) => {
      const onData = (data: Buffer) => {
        const char = data.toString().trim();
        process.stdin.removeListener("data", onData);

        let decision: ToolPermissionState | null = null;
        if (char === "y") {
          decision = "approve_once";
        } else if (char === "Y") {
          decision = "approve_always";
        } else if (char === "n") {
          decision = "deny";
        }

        if (decision) {
          panelMode = "input";
          pendingToolName = null;
          pendingToolDef = null;
          pendingToolArgs = null;
          inputManager.unsupressInput();
          rerenderPanel();
          resolve(decision);
        }
      };
      process.stdin.on("data", onData);
    });
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
        "  /model <name>   - Switch model",
        "  /clear          - Clear session history",
        "  /agent <prompt> - Spawn subagent",
        "  /agents         - List agents",
        "  /config         - Show current config",
        "  /stats          - Show session stats",
        "  /tools          - List available tools",
        "  /test           - Output test lines",
        "  /exit           - Exit REPL",
        "  /help           - Show this help",
      ].join("\n");
    });
  };

  const handleInput = async (input: string): Promise<void> => {
    outputBuffer.scroll("\n");
    outputBuffer.scroll(formatUserInputPanel(input).join("\n") + "\n\n");

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
    isStreaming = true;

    const startTime = Date.now();
    let tokensIn = 0;
    let tokensOut = 0;

    try {
      const callbacks = createCallbacks({
        showThinking,
        onToken: (token) => {
          outputBuffer.scroll(token);
        },
        onThinking: (chunk) => {
          if (!isThinking) {
            isThinking = true;
            if (showThinking) {
              outputBuffer.scroll("\n");
            }
          }
          if (showThinking && chunk) {
            outputBuffer.scroll(
              formatThinking(chunk, outputBuffer.getCursorCol()),
            );
          }
          rerenderPanel();
        },
        onThinkingEnd: (durationMs) => {
          if (showThinking) {
            if (outputBuffer.getCursorCol() > 1) {
              outputBuffer.scroll("\n");
            }
          }
          isThinking = false;
        },
      });

      const fullResponse = await executeToolLoop(
        client,
        session,
        toolRegistry,
        toolRegistry.getDefinitions(),
        callbacks,
      );

      outputBuffer.scroll("\n");

      const duration = Date.now() - startTime;
      tokensIn = session
        .getMessages()
        .reduce((sum, m) => sum + m.content.length, 0);
      tokensOut = fullResponse.length;
      statsDB.recordRequest(
        duration,
        Math.ceil(tokensIn / 4),
        Math.ceil(tokensOut / 4),
      );

      session.addMessage("assistant", fullResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outputBuffer.scroll(wrapFgRgb(ANSI.color.red500, `✗ ${message}`));
    } finally {
      isStreaming = false;
      isThinking = false;
    }

    const duration = Date.now() - startTime;
    let infoBuffer = `\n${formatDuration(duration)}`;
    if (tokensIn > 0) {
      infoBuffer += ` ${CHARS.separator} in:${tokensIn}`;
    }
    if (tokensOut > 0) {
      infoBuffer += ` ${CHARS.separator} out:${tokensOut}`;
    }
    infoBuffer += "\n";
    outputBuffer.scroll(wrapFgRgb(ANSI.color.gray500, infoBuffer));
  };

  const handleAgent = async (prompt: string): Promise<string> => {
    session.addMessage("user", `/agent ${prompt}`);

    const agent = agentManager.spawn(prompt, session.getMessages());

    const result = await agent.run();

    session.addMessage("assistant", result.content);

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
      toolRegistry.updateApprovalCallback(promptToolApproval);
      await outputBuffer.init(inputManager);
      inputManager.start();

      outputBuffer.scroll(
        wrapFgRgb(
          ANSI.color.gray500,
          "Type a message or /help for commands. Ctrl+C to cancel.",
        ),
      );
      outputBuffer.scroll("\n");

      await waitForTermination();

      process.stdout.write(clearFromCursor());
      inputManager.stop();
      agentManager.abortAll();
      process.exit(0);
    },

    stop: (): void => {
      terminateMe();
    },
  };
};
