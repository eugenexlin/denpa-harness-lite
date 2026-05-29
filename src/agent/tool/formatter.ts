import type {
  InternalToolDefinition,
  InternalToolParam,
  InternalToolCall,
  InternalMessage,
} from "./internal";

export interface ToolFormatter {
  formatTools(tools: InternalToolDefinition[]): unknown;
  formatMessages(messages: InternalMessage[]): unknown;
  parseToolCalls(raw: unknown): InternalToolCall[];
  parseMessage(raw: unknown): InternalMessage;
}

function toOpenAIParam(param: InternalToolParam): Record<string, unknown> {
  const result: Record<string, unknown> = { type: param.type };
  if (param.description) result.description = param.description;
  if (param.enum) result.enum = param.enum;
  if (param.items) result.items = toOpenAIParam(param.items);
  if (param.default !== undefined) result.default = param.default;
  if (param.minimum !== undefined) result.minimum = param.minimum;
  if (param.maximum !== undefined) result.maximum = param.maximum;
  if (param.minLength !== undefined) result.minLength = param.minLength;
  if (param.maxLength !== undefined) result.maxLength = param.maxLength;
  if (param.pattern) result.pattern = param.pattern;
  if (param.format) result.format = param.format;
  if (param.properties) {
    result.properties = Object.fromEntries(
      Object.entries(param.properties).map(([k, v]) => [k, toOpenAIParam(v)])
    );
  }
  if (param.additionalProperties !== undefined) {
    result.additionalProperties =
      typeof param.additionalProperties === "boolean"
        ? param.additionalProperties
        : toOpenAIParam(param.additionalProperties);
  }
  if (param.anyOf) result.anyOf = param.anyOf.map(toOpenAIParam);
  if (param.oneOf) result.oneOf = param.oneOf.map(toOpenAIParam);
  if (param.allOf) result.allOf = param.allOf.map(toOpenAIParam);
  if (param.const !== undefined) result.const = param.const;
  if (param.nullable) result.nullable = param.nullable;
  return result;
}

const openAIFormatter: ToolFormatter = {
  formatTools: (tools: InternalToolDefinition[]) =>
    tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object" as const,
          properties: Object.fromEntries(
            Object.entries(tool.parameters).map(([k, v]) => [k, toOpenAIParam(v)])
          ),
          required: tool.required?.length ? tool.required : undefined,
        },
      },
    })),

  formatMessages: (messages: InternalMessage[]) =>
    messages.map((msg) => {
      const base = { role: msg.role, content: msg.content };
      if (msg.role === "tool" && msg.tool_call_id) {
        return { ...base, tool_call_id: msg.tool_call_id };
      }
      if (msg.name) {
        return { ...base, name: msg.name };
      }
      return base;
    }),

  parseToolCalls: (raw: unknown): InternalToolCall[] => {
    if (!raw || !Array.isArray(raw)) return [];
    return raw
      .filter((tc) => tc && typeof tc === "object" && tc.id && tc.function)
      .map((tc) => ({
        id: tc.id as string,
        name: (tc.function as Record<string, unknown>).name as string,
        arguments: (() => {
          const args = (tc.function as Record<string, unknown>).arguments as string;
          try {
            return JSON.parse(args) as Record<string, unknown>;
          } catch {
            return {};
          }
        })(),
      }));
  },

  parseMessage: (raw: unknown): InternalMessage => {
    if (!raw || typeof raw !== "object") {
      return { role: "assistant", content: "" };
    }
    const obj = raw as Record<string, unknown>;
    return {
      role: obj.role as "system" | "user" | "assistant" | "tool",
      content: (obj.content as string) ?? "",
      tool_call_id: obj.tool_call_id as string | undefined,
      name: obj.name as string | undefined,
    };
  },
};

export { openAIFormatter };
