import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve, isAbsolute } from "node:path";
import type {
  UserConfig,
  ProjectConfig,
  PermissionsConfig,
  ResolvedConfig,
  ModelConfig,
  HarnessMode,
} from "./types";
import { DEFAULTS, DEFAULT_PERMISSIONS } from "./types";

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
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
};

const findGitRoot = (cwd: string): string | null => {
  let current = isAbsolute(cwd) ? resolve(cwd) : resolve(process.cwd(), cwd);
  const root = current.split(":")[0] + ":";
  while (true) {
    if (existsSync(join(current, ".git"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current || parent === root) {
      return null;
    }
    current = parent;
  }
};

export interface ConfigManager {
  resolve: (cliOverrides?: { model?: string; apiKey?: string; baseUrl?: string; provider?: string }) => ResolvedConfig;
  saveUserConfig: (config: Partial<UserConfig>) => void;
  saveProjectConfig: (config: Partial<ProjectConfig>) => void;
  savePermissions: (config: Partial<PermissionsConfig>, mode?: HarnessMode) => void;
  getUserConfig: () => UserConfig | null;
  getProjectConfig: () => ProjectConfig | null;
  getPermissions: () => PermissionsConfig | null;
  getMode: () => HarnessMode;
  getProjectRoot: () => string | null;
}

export const createConfigManager = (cwd: string): ConfigManager => {
  const userConfigPath = join(resolveHome("~/.denpa/config.json"));
  const gitRoot = findGitRoot(cwd);
  const mode: HarnessMode = gitRoot ? "project" : "system";
  const projectRoot = gitRoot;

  const projectConfigPath = gitRoot ? join(gitRoot, ".denpa", "config.json") : null;
  const permissionsPath = gitRoot
    ? join(gitRoot, ".denpa", "permissions.json")
    : join(resolveHome("~/.denpa/permissions.json"));

  let userConfig: UserConfig | null = null;
  let projectConfig: ProjectConfig | null = null;
  let permissions: PermissionsConfig | null = null;

  const loadUserConfig = (): UserConfig => {
    const raw = loadJson<UserConfig>(userConfigPath);
    const models = raw?.models ?? {};
    return {
      models,
      default_model: raw?.default_model ?? DEFAULTS.default_model,
      max_parallel_agents: raw?.max_parallel_agents ?? DEFAULTS.max_parallel_agents,
      agent_block_prompt: raw?.agent_block_prompt ?? DEFAULTS.agent_block_prompt,
      show_thinking: raw?.show_thinking ?? DEFAULTS.show_thinking,
      system_prompt_append: raw?.system_prompt_append ?? DEFAULTS.system_prompt_append,
    };
  };

  const loadProjectConfig = (): ProjectConfig => {
    if (!projectConfigPath) return {};
    const raw = loadJson<ProjectConfig>(projectConfigPath);
    return raw ?? {};
  };

  const loadPermissions = (): PermissionsConfig => {
    const raw = loadJson<PermissionsConfig>(permissionsPath);
    return {
      sandbox_paths: raw?.sandbox_paths ?? DEFAULT_PERMISSIONS.sandbox_paths,
      tools: raw?.tools ?? DEFAULT_PERMISSIONS.tools,
    };
  };

  const mergeModels = (user: UserConfig, project: ProjectConfig): Record<string, ModelConfig> => {
    const merged = { ...user.models };
    if (project.models) {
      for (const [name, config] of Object.entries(project.models)) {
        merged[name] = config;
      }
    }
    return merged;
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
      permissions ??= loadPermissions();

      const mergedModels = mergeModels(userConfig, projectConfig);

      const defaultModelName =
        cliOverrides?.model ??
        projectConfig?.default_model ??
        userConfig.default_model;

      let model: ModelConfig;
      const envModel = getModelFromEnv();

      if (envModel && (cliOverrides?.apiKey || cliOverrides?.baseUrl)) {
        model = {
          ...envModel,
          ...(cliOverrides?.apiKey ? { api_key: cliOverrides.apiKey } : {}),
          ...(cliOverrides?.baseUrl ? { base_url: cliOverrides.baseUrl } : {}),
        };
      } else if (defaultModelName && mergedModels[defaultModelName]) {
        model = mergedModels[defaultModelName];
      } else if (envModel) {
        model = envModel;
      } else {
        throw new Error(
          "No model configured. Add a model to ~/.denpa/config.json or set OPENAI_API_KEY env var."
        );
      }

      return {
        model,
        models: mergedModels,
        defaultModelName,
        maxParallelAgents: projectConfig?.max_parallel_agents ?? userConfig.max_parallel_agents,
        agentBlockPrompt: projectConfig?.agent_block_prompt ?? userConfig.agent_block_prompt,
        sandboxPaths: permissions.sandbox_paths ?? DEFAULT_PERMISSIONS.sandbox_paths ?? ["."],
        showThinking: projectConfig?.show_thinking ?? userConfig.show_thinking,
        systemPromptAppend: projectConfig?.system_prompt_append ?? userConfig.system_prompt_append ?? "",
        mode,
        projectRoot,
        permissions,
      };
    },

    saveUserConfig: (config: Partial<UserConfig>): void => {
      userConfig ??= loadUserConfig();
      const merged = { ...userConfig, ...config } as UserConfig;
      saveJson(userConfigPath, merged);
      userConfig = merged;
    },

    saveProjectConfig: (config: Partial<ProjectConfig>): void => {
      if (!projectConfigPath) {
        throw new Error("Cannot save project config in system mode");
      }
      projectConfig ??= loadProjectConfig();
      const merged = { ...projectConfig, ...config } as ProjectConfig;
      saveJson(projectConfigPath, merged);
      projectConfig = merged;
    },

    savePermissions: (config: Partial<PermissionsConfig>, targetMode?: HarnessMode): void => {
      const targetPath = targetMode === "system"
        ? join(resolveHome("~/.denpa/permissions.json"))
        : permissionsPath;
      permissions ??= loadPermissions();
      const merged = { ...permissions, ...config } as PermissionsConfig;
      saveJson(targetPath, merged);
      permissions = merged;
    },

    getUserConfig: (): UserConfig | null => userConfig,

    getProjectConfig: (): ProjectConfig | null => projectConfig,

    getPermissions: (): PermissionsConfig | null => permissions,

    getMode: (): HarnessMode => mode,

    getProjectRoot: (): string | null => projectRoot,
  };
};
