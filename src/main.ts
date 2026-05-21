#!/usr/bin/env bun
import { createConfigManager, getHomeDir } from "./config/manager";
import { createStatsDB } from "./stats/db";
import { createScreenManager } from "./terminal/screen";
import { createInputManager } from "./terminal/input";
import { createAPIClient } from "./api/client";
import { createSession } from "./agent/session";
import { createSubagentManager } from "./agent/subagent-manager";
import { createDefaultRegistry } from "./agent/tool/registry";
import { createREPL } from "./repl/repl";
import { runCLI } from "./cli/cli";

const getProjectRoot = (): string => process.cwd();

const main = (): void => {
  const args = process.argv.slice(2);
  const projectRoot = getProjectRoot();

  // Parse CLI flags
  let mode: "repl" | "cli" = "repl";
  let message = "";
  let cliModel: string | undefined;
  let cliApiKey: string | undefined;
  let cliBaseUrl: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--model" || arg === "-m") {
      cliModel = args[++i];
    } else if (arg === "--api-key" || arg === "-k") {
      cliApiKey = args[++i];
    } else if (arg === "--base-url" || arg === "-u") {
      cliBaseUrl = args[++i];
    } else if (!arg.startsWith("-")) {
      if (mode === "repl") {
        mode = "cli";
      }
      message += (message ? " " : "") + arg;
    }
  }

  // Init config
  const configManager = createConfigManager(projectRoot);
  const config = configManager.resolve({
    model: cliModel,
    apiKey: cliApiKey,
    baseUrl: cliBaseUrl,
  });

  // Init stats DB
  const statsPath = "~/.denpa/stats.db";
  const statsDB = createStatsDB(statsPath.replace("~", getHomeDir()));

  // Init API client
  const client = createAPIClient(
    config.model.base_url,
    config.model.api_key,
    config.defaultModelName,
  );

  // Init session
  const session = createSession(
    "You are a helpful coding assistant. Be concise and direct.",
  );

  // Init tools
  const toolRegistry = createDefaultRegistry(config.sandboxPaths);

  // Init subagent manager
  const agentManager = createSubagentManager(
    client,
    "You are a helpful coding assistant. Be concise and direct.",
    toolRegistry.getDefinitions(),
  );

  // Init terminal
  const screen = createScreenManager();
  const input = createInputManager(screen);

  if (mode === "cli") {
    runCLI(message, client, session, statsDB, toolRegistry.getDefinitions());
  } else {
    const repl = createREPL(
      screen,
      input,
      client,
      session,
      agentManager,
      toolRegistry,
      statsDB,
    );
    repl.run().finally(() => {
      repl.stop();
      statsDB.close();
    });
  }
};

main();
