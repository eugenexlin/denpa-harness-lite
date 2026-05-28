#!/usr/bin/env bun
import { createConfigManager, getHomeDir } from "./config/manager";
import { join } from "node:path";
import { createStatsDB } from "./stats/db";
import { createAPIClient } from "./api/client";
import { createSession } from "./agent/session";
import { createSubagentManager } from "./agent/subagent-manager";
import {
  createDefaultRegistry,
  type ToolApprovalCallback,
} from "./agent/tool/registry";
import { createRepl } from "./repl/repl";
import { runCLI } from "./cli/cli";
import { ANSI_STYLE, fgGray, fgYellow } from "./terminal/ansi";

const main = async (): Promise<void> => {
  process.stdin.setRawMode(true);
  const args = process.argv.slice(2);

  // Parse CLI flags
  let runMode: "repl" | "cli" = "repl";
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
      if (runMode === "repl") {
        runMode = "cli";
      }
      message += (message ? " " : "") + arg;
    }
  }

  // Init config
  const configManager = createConfigManager(process.cwd());
  const config = configManager.resolve({
    model: cliModel,
    apiKey: cliApiKey,
    baseUrl: cliBaseUrl,
  });

  // Print mode indicator
  const denpaLabel = `${ANSI_STYLE.fg.cyan}${ANSI_STYLE.bold}denpa-harness-lite${ANSI_STYLE.reset}`;
  if (config.mode === "project") {
    console.log(`${denpaLabel} [${fgGray(`project: ${config.projectRoot}`)}]`);
  } else {
    console.log(`${denpaLabel} [${fgGray("system mode")}]`);
  }
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
  const onToolPending: ToolApprovalCallback | undefined =
    runMode === "repl"
      ? async (
          name: string,
          def: import("./agent/tool/types").ToolDefinition,
        ): Promise<"approved" | "denied"> => {
          const fn = def.function;
          console.log(fgYellow(`\n⚠ Tool '${name}' requires approval:`));
          console.log(`  ${fn.description}`);
          const params = Object.entries(fn.parameters.properties)
            .map(([k, v]) => `${k} (${v.type})`)
            .join(", ");
          if (params) console.log(`  Params: ${params}`);
          process.stdout.write("Approve? [y/N]: ");
          return new Promise((resolve) => {
            const onData = (data: Buffer) => {
              const char = data.toString().trim().toLowerCase();
              process.stdin.removeListener("data", onData);
              process.stdin.setRawMode(true);
              if (char === "y" || char === "yes") {
                console.log("approved");
                resolve("approved");
              } else {
                console.log("denied");
                resolve("denied");
              }
            };
            process.stdin.setRawMode(false);
            process.stdin.on("data", onData);
          });
        }
      : undefined;

  const customToolsDirs =
    config.mode === "project" && config.projectRoot
      ? [join(config.projectRoot, ".denpa", "tools")]
      : [join(getHomeDir(), ".denpa", "tools")];

  const toolRegistry = await createDefaultRegistry({
    sandboxPaths: config.sandboxPaths,
    permissions: config.permissions,
    onToolPending,
    customToolsDirs,
  });

  // Init subagent manager
  const agentManager = createSubagentManager(
    client,
    "You are a helpful coding assistant. Be concise and direct.",
    toolRegistry.getDefinitions(),
  );

  // Init terminal

  if (runMode === "cli") {
    await runCLI(
      message,
      client,
      session,
      statsDB,
      toolRegistry.getDefinitions(),
    );
    const denied = toolRegistry.getDeniedTools();
    if (denied.length > 0) {
      console.log(
        fgGray(`\n⚠ Denied tools: ${[...new Set(denied)].join(", ")}`),
      );
    }
  } else {
    const repl = createRepl(
      client,
      session,
      agentManager,
      toolRegistry,
      statsDB,
      { showThinking: config.showThinking },
    );
    repl.run().finally(() => {
      repl.stop();
      statsDB.close();
    });
  }
};

main();
