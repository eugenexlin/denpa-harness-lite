#!/usr/bin/env bun
import { createConfigManager, getHomeDir } from "./config/manager";
import { join } from "node:path";
import { createStatsDB } from "./stats/db";
import { createAPIClient } from "./api/client";
import { createSession } from "./agent/session";
import { createSubagentManager } from "./agent/subagent-manager";
import { createDefaultRegistry } from "./agent/tool/registry";
import { buildSystemPrompt } from "./agent/prompt";
import { createRepl } from "./repl/repl";
import { runCLI } from "./cli/cli";
import { openAIFormatter } from "./agent/tool/formatter";
import { ANSI, wrapFgRgb } from "./terminal/ansi";
import type { ResolvedConfig } from "./config/types";

const main = async (): Promise<void> => {
  process.stdin.setRawMode(true);
  const args = process.argv.slice(2);

  // Parse CLI flags
  let runMode: "repl" | "cli" = "repl";
  let message = "";
  let cliModel: string | undefined;
  let cliApiKey: string | undefined;
  let cliBaseUrl: string | undefined;
  let cliVerbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--model" || arg === "-m") {
      cliModel = args[++i];
    } else if (arg === "--api-key" || arg === "-k") {
      cliApiKey = args[++i];
    } else if (arg === "--base-url" || arg === "-u") {
      cliBaseUrl = args[++i];
    } else if (arg === "--verbose" || arg === "-v") {
      cliVerbose = true;
    } else if (!arg.startsWith("-")) {
      if (runMode === "repl") {
        runMode = "cli";
      }
      message += (message ? " " : "") + arg;
    }
  }

  // Init config
  const configManager = createConfigManager(process.cwd());
  const config: ResolvedConfig = configManager.resolve({
    model: cliModel,
    apiKey: cliApiKey,
    baseUrl: cliBaseUrl,
  });

  // Print mode indicator
  const denpaLabel = `${ANSI.fg.cyan}${ANSI.bold}denpa-harness-lite${ANSI.reset}`;
  if (config.mode === "project") {
    console.log(
      `${denpaLabel} [${wrapFgRgb(ANSI.color.gray500, `project: ${config.projectRoot}`)}]`,
    );
  } else {
    console.log(
      `${denpaLabel} [${wrapFgRgb(ANSI.color.gray500, "system mode")}]`,
    );
  }
  // Init stats DB
  const statsPath = "~/.denpa/stats.db";
  const statsDB = createStatsDB(statsPath.replace("~", getHomeDir()));

  // Init API client
  const client = createAPIClient(
    config.model.base_url,
    config.model.api_key,
    config.defaultModelName,
    { formatter: openAIFormatter },
  );

  // Init session (placeholder prompt, updated after tools are loaded)
  const session = createSession();

  // Init tools
  const customToolsDirs =
    config.mode === "project" && config.projectRoot
      ? [join(config.projectRoot, ".denpa", "tools")]
      : [join(getHomeDir(), ".denpa", "tools")];

  const toolRegistry = await createDefaultRegistry({
    sandboxPaths: config.sandboxPaths,
    permissions: config.permissions,
    onPermissionChange: (name, state) => {
      configManager.savePermissions({
        tools: {
          ...config.permissions.tools,
          [name]: { state },
        },
      });
    },
    customToolsDirs,
  });

  // Build system prompt with runtime context
  const systemPrompt = buildSystemPrompt({
    cwd: process.cwd(),
    platform: process.platform,
    projectRoot: config.projectRoot,
    sandboxPaths: config.sandboxPaths,
    toolNames: toolRegistry.list(),
    userAppend: config.systemPromptAppend,
    guidelines: config.guidelines,
  });

  session.setSystemPrompt(systemPrompt);

  // Init subagent manager
  const agentManager = createSubagentManager(
    client,
    systemPrompt,
    toolRegistry,
    toolRegistry.getDefinitions(),
  );

  // Init terminal

  if (runMode === "cli") {
    await runCLI(
      message,
      client,
      session,
      statsDB,
      {
        ...config,
        ...(cliVerbose ? { showThinking: true, showToolResult: true } : {}),
      },
      toolRegistry.getDefinitions(),
      toolRegistry,
    );
    const denied = toolRegistry.getDeniedTools();
    if (denied.length > 0) {
      console.log(
        wrapFgRgb(
          ANSI.color.gray500,
          `\n⚠ Denied tools: ${[...new Set(denied)].join(", ")}`,
        ),
      );
    }
  } else {
    const repl = createRepl(
      client,
      session,
      agentManager,
      toolRegistry,
      statsDB,
      config,
    );
    repl.run().finally(() => {
      repl.stop();
      statsDB.close();
    });
  }
};

main();
