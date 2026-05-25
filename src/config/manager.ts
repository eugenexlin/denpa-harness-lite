import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { UserConfig, ProjectConfig, ResolvedConfig, ModelConfig } from "./types";
import { DEFAULTS } from "./types";

export const getHomeDir = (): string => process.env.HOME || process.env.USERPROFILE || "";

const resolveHome = (path: string): string => path.replace("~", getHomeDir());

const loadJson = <T,>(filePath: string): T | null => {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
};

const saveJson = (filePath: string, data: unknown): void => {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    const { mkdirSync } = require("node:fs");
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
};

export interface ConfigManager {
  resolve: (cliOverrides?: { model?: string; apiKey?: string; baseUrl?: string; provider?: string }) => ResolvedConfig;
  saveUserConfig: (config: Partial<UserConfig>) => void;
  saveProjectConfig: (config: Partial<ProjectConfig>) => void;
  getUserConfig: () => UserConfig | null;
  getProjectConfig: () => ProjectConfig | null;
}

export const createConfigManager = (projectRoot: string): ConfigManager => {
  const userConfigPath = join(resolveHome("~/.denpa/config.json"));
  const projectConfigPath = join(projectRoot, ".denpa", "config.json");
  let userConfig: UserConfig | null = null;
  let projectConfig: ProjectConfig | null = null;

  const loadUserConfig = (): UserConfig => {
    const raw = loadJson<UserConfig>(userConfigPath);
    const models = raw?.models ?? {};
    return {
      models,
      default_model: raw?.default_model ?? DEFAULTS.default_model,
      max_parallel_agents: raw?.max_parallel_agents ?? DEFAULTS.max_parallel_agents,
      agent_block_prompt: raw?.agent_block_prompt ?? DEFAULTS.agent_block_prompt,
      show_thinking: raw?.show_thinking ?? DEFAULTS.show_thinking,
    };
  };

  const loadProjectConfig = (): ProjectConfig => {
    const raw = loadJson<ProjectConfig>(projectConfigPath);
    return {
      sandbox_paths: raw?.sandbox_paths ?? ["."],
      enabled_tools: raw?.enabled_tools ?? [],
    };
  };

  const getModelFromEnv = (): ModelConfig | null => {
    const key = process.env.OPENAI_API_KEY;
    const url = process.env.OPENAI_BASE_URL;
    if (!key) return null;
    return {
      provider: "openai",
      api_key: key,
      base_url: url ?? "https://api.openai.com/v1",
    };
  };

  return {
    resolve: (cliOverrides?: {
      model?: string;
      apiKey?: string;
      baseUrl?: string;
      provider?: string;
    }): ResolvedConfig => {
      userConfig ??= loadUserConfig();
      projectConfig ??= loadProjectConfig();

      const modelName = cliOverrides?.model ?? userConfig.default_model;
      let model: ModelConfig;

      const envModel = getModelFromEnv();
      if (envModel && (cliOverrides?.apiKey || cliOverrides?.baseUrl)) {
        model = {
          ...envModel,
          ...(cliOverrides?.apiKey ? { api_key: cliOverrides.apiKey } : {}),
          ...(cliOverrides?.baseUrl ? { base_url: cliOverrides.baseUrl } : {}),
        };
      } else if (modelName && userConfig.models[modelName]) {
        model = userConfig.models[modelName];
      } else if (envModel) {
        model = envModel;
      } else {
        throw new Error(
          "No model configured. Add a model to ~/.denpa/config.json or set OPENAI_API_KEY env var."
        );
      }

      return {
        model,
        defaultModelName: modelName,
        maxParallelAgents: userConfig.max_parallel_agents,
        agentBlockPrompt: userConfig.agent_block_prompt,
        sandboxPaths: projectConfig.sandbox_paths,
        enabledTools: projectConfig.enabled_tools,
        showThinking: userConfig.show_thinking,
      };
    },

    saveUserConfig: (config: Partial<UserConfig>): void => {
      const merged = { ...userConfig, ...config } as UserConfig;
      saveJson(userConfigPath, merged);
      userConfig = merged;
    },

    saveProjectConfig: (config: Partial<ProjectConfig>): void => {
      const merged = { ...projectConfig, ...config } as ProjectConfig;
      saveJson(projectConfigPath, merged);
      projectConfig = merged;
    },

    getUserConfig: (): UserConfig | null => userConfig,

    getProjectConfig: (): ProjectConfig | null => projectConfig,
  };
};
