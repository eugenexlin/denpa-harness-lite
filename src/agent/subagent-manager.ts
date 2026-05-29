import type { Message } from "../api/types";
import type { InternalToolDefinition } from "../agent/tool/internal";
import type { APIClient } from "../api/client";
import type { ToolRegistry } from "../agent/tool/registry";
import type { Subagent } from "./subagent";
import { createSubagent } from "./subagent";

export interface SubagentManager {
  spawn: (prompt: string, parentContext: Message[]) => Subagent;
  get: (id: number) => Subagent | undefined;
  getAll: () => Subagent[];
  getRunning: () => Subagent[];
  getCompleted: () => Subagent[];
  getRunningCount: () => number;
  abortAll: () => void;
  cleanup: () => void;
}

export const createSubagentManager = (
  client: APIClient,
  systemPrompt: string,
  toolRegistry: ToolRegistry,
  tools?: InternalToolDefinition[],
): SubagentManager => {
  const agents = new Map<number, Subagent>();
  let nextId = 1;

  return {
    spawn: (prompt: string, parentContext: Message[]): Subagent => {
      const id = nextId++;
      const agent = createSubagent(
        id,
        prompt,
        parentContext,
        client,
        systemPrompt,
        toolRegistry,
        tools,
      );
      agents.set(id, agent);

      agent.run().then(() => {
        // Keep in map for status checking
      });

      return agent;
    },

    get: (id: number): Subagent | undefined => {
      return agents.get(id);
    },

    getAll: (): Subagent[] => {
      return Array.from(agents.values());
    },

    getRunning: (): Subagent[] => {
      return Array.from(agents.values()).filter(
        (a) => a.getStatus() === "running",
      );
    },

    getCompleted: (): Subagent[] => {
      return Array.from(agents.values()).filter(
        (a) => a.getStatus() === "complete",
      );
    },

    getRunningCount: (): number => {
      return getRunning().length;
    },

    abortAll: (): void => {
      for (const agent of agents.values()) {
        if (agent.getStatus() === "running") {
          agent.abort();
        }
      }
    },

    cleanup: (): void => {
      const all = Array.from(agents.values());
      const completed = all.filter((a) => a.getStatus() !== "running");
      if (completed.length > 10) {
        for (const agent of completed.slice(0, completed.length - 10)) {
          agents.delete(agent.id);
        }
      }
    },
  };
};
