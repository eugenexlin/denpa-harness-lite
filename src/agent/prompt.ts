import { SYSTEM_GUIDELINES, SYSTEM_PROMPT } from "./guidelines";

export const buildSystemPrompt = (options: {
  cwd: string;
  platform: string;
  projectRoot: string | null;
  sandboxPaths: string[];
  toolNames: string[];
  userAppend: string;
  guidelines?: string[];
}): string => {
  const lines: string[] = [];

  lines.push(SYSTEM_PROMPT);
  lines.push("");
  lines.push(`Working directory: ${options.cwd}`);
  lines.push(`OS: ${options.platform}`);

  if (options.projectRoot) {
    lines.push(`Project root: ${options.projectRoot}`);
  }

  lines.push("");
  lines.push("Guidelines:");
  for (const g of SYSTEM_GUIDELINES) {
    lines.push(`- ${g}`);
  }

  if (options.guidelines?.length) {
    lines.push("");
    for (const g of options.guidelines) {
      lines.push(`- ${g}`);
    }
  }

  // if (options.sandboxPaths.length > 0) {
  //   lines.push(`Sandbox paths: ${options.sandboxPaths.join(", ")}`);
  // }

  if (options.toolNames.length > 0) {
    lines.push("");
    lines.push(`Available tools: ${options.toolNames.join(", ")}`);
  }

  if (options.userAppend) {
    lines.push("");
    lines.push(options.userAppend);
  }

  return lines.join("\n");
};
