export interface InternalToolParam {
  type: string;
  description?: string;
  enum?: string[];
  items?: InternalToolParam;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  properties?: Record<string, InternalToolParam>;
  additionalProperties?: boolean | InternalToolParam;
  anyOf?: InternalToolParam[];
  oneOf?: InternalToolParam[];
  allOf?: InternalToolParam[];
  const?: unknown;
  nullable?: boolean;
  [key: string]: unknown;
}

export interface InternalToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, InternalToolParam>;
  required?: string[];
}

export interface InternalToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export interface InternalMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}
