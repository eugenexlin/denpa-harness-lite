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
}

export interface ProjectConfig {
  sandbox_paths: string[];
  enabled_tools: string[];
}

export interface ResolvedConfig {
  model: ModelConfig;
  defaultModelName: string;
  maxParallelAgents: number;
  agentBlockPrompt: boolean;
  sandboxPaths: string[];
  enabledTools: string[];
  showThinking: boolean;
}

export const DEFAULTS: Omit<UserConfig, "models"> = {
  default_model: "",
  max_parallel_agents: 0,
  agent_block_prompt: true,
  show_thinking: false,
};
