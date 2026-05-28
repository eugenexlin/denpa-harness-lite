import { resolve, isAbsolute } from "node:path";
import { isSensitivePath as checkSensitive, getSensitivePathReason } from "../../config/sensitive-paths";

export interface ToolContextOptions {
  sandboxPaths?: string[];
  cwd?: string;
}

export interface ToolContext {
  sandboxPaths: string[];
  cwd: string;
  validatePath: (requestedPath: string) => string;
  warnSensitive: (resolvedPath: string) => void;
  isSensitivePath: (resolvedPath: string) => boolean;
}

export const createToolContext = (options: ToolContextOptions = {}): ToolContext => {
  const cwd = options.cwd ?? process.cwd();
  const sandboxPaths = (options.sandboxPaths ?? ["."]).map((p) =>
    isAbsolute(p) ? resolve(p) : resolve(cwd, p),
  );

  const validatePath = (requestedPath: string): string => {
    const resolved = isAbsolute(requestedPath)
      ? resolve(requestedPath)
      : resolve(cwd, requestedPath);

    for (const sandbox of sandboxPaths) {
      if (resolved.startsWith(sandbox)) {
        return resolved;
      }
    }

    throw new Error(
      `Path outside sandbox: ${requestedPath} (sandbox: ${sandboxPaths.join(", ")})`,
    );
  };

  const warnSensitive = (resolvedPath: string): void => {
    if (checkSensitive(resolvedPath)) {
      const reason = getSensitivePathReason(resolvedPath) ?? "sensitive path";
      process.stderr.write(`⚠ Accessing sensitive path: ${resolvedPath} (${reason})\n`);
    }
  };

  return {
    sandboxPaths,
    cwd,
    validatePath,
    warnSensitive,
    isSensitivePath: checkSensitive,
  };
};
