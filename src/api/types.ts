import type { InternalToolDefinition, InternalToolCall, InternalMessage } from "../agent/tool/internal";

export type Message = InternalMessage;
export type { InternalToolCall };

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      reasoning_content?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
      reasoning_content?: string;
      tool_calls?: {
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }[];
    };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type { ToolDefinition } from "../agent/tool/types";

export interface APIStats {
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  tools?: InternalToolDefinition[];
  stream?: boolean;
  parallel_tool_calls?: boolean;
}
