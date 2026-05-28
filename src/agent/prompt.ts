export const buildSystemPrompt = (options: {
  cwd: string;
  platform: string;
  projectRoot: string | null;
  sandboxPaths: string[];
  toolNames: string[];
  userAppend: string;
}): string => {
  const lines: string[] = [];

  lines.push("You are a coding assistant. Be concise and direct.");
  lines.push("");
  lines.push(`Working directory: ${options.cwd}`);
  lines.push(`OS: ${options.platform}`);

  if (options.projectRoot) {
    lines.push(`Project root: ${options.projectRoot}`);
  }

  if (options.sandboxPaths.length > 0) {
    lines.push(`Sandbox paths: ${options.sandboxPaths.join(", ")}`);
  }

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
