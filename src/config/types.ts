export interface ModelConfig {
  provider: string;
  api_key: string;
  base_url: string;
}

export interface UserConfig {
  models: Record<string, ModelConfig>;
  default_model: string;
  max_parallel_agents: number;
  agent_block_prompt: boolean;
  show_thinking: boolean;
  system_prompt_append?: string;
}

export interface ProjectConfig {
  models?: Record<string, ModelConfig>;
  default_model?: string;
  max_parallel_agents?: number;
  agent_block_prompt?: boolean;
  show_thinking?: boolean;
  system_prompt_append?: string;
}

export interface ToolPermission {
  state: "approved" | "denied";
  file_mtime?: number;
}

export interface PermissionsConfig {
  sandbox_paths?: string[];
  tools?: Record<string, ToolPermission>;
}

export type HarnessMode = "project" | "system";

export interface ResolvedConfig {
  model: ModelConfig;
  models: Record<string, ModelConfig>;
  defaultModelName: string;
  maxParallelAgents: number;
  agentBlockPrompt: boolean;
  sandboxPaths: string[];
  showThinking: boolean;
  systemPromptAppend: string;
  mode: HarnessMode;
  projectRoot: string | null;
  permissions: PermissionsConfig;
}

export const DEFAULTS: Omit<UserConfig, "models"> = {
  default_model: "",
  max_parallel_agents: 0,
  agent_block_prompt: true,
  show_thinking: false,
  system_prompt_append: "",
};

export const DEFAULT_PERMISSIONS: PermissionsConfig = {
  sandbox_paths: ["."],
  tools: {},
};
