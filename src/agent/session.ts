import type { Message } from "../api/types";

export interface Session {
  getMessages: () => Message[];
  addMessage: (
    role: "user" | "assistant" | "tool" | "system",
    content: string,
    options?: { tool_call_id?: string },
  ) => void;
  setSystemPrompt: (prompt: string) => void;
  clear: () => void;
  getHistory: () => Message[];
  peekLastAssistant: () => string | null;
}

export const createSession = (systemPrompt: string = ""): Session => {
  const messages: Message[] = [];
  let currentSystemPrompt = systemPrompt;

  return {
    getMessages: (): Message[] => messages,

    addMessage: (
      role: "user" | "assistant" | "tool" | "system",
      content: string,
      options?: { tool_call_id?: string },
    ): void => {
      const msg: Message = { role, content };
      if (role === "tool" && options?.tool_call_id) {
        msg.tool_call_id = options.tool_call_id;
      }
      messages.push(msg);
    },

    setSystemPrompt: (prompt: string): void => {
      currentSystemPrompt = prompt;
    },

    clear: (): void => {
      messages.length = 0;
    },

    getHistory: (): Message[] => {
      const history: Message[] = [];
      if (currentSystemPrompt) {
        history.push({ role: "system", content: currentSystemPrompt });
      }
      return [...history, ...messages];
    },

    peekLastAssistant: (): string | null => {
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg && msg.role === "assistant") {
          return msg.content;
        }
      }
      return null;
    },
  };
};
