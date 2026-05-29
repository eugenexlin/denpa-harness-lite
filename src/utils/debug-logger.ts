import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const LOG_DIR = ".denpa";
const LOG_FILE = join(LOG_DIR, "debug.log");

const ensureLogDir = (): void => {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
};

const formatValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
};

export const logFile = (...params: unknown[]): void => {
  ensureLogDir();

  const timestamp = new Date().toISOString();
  const lines = [`=== ${timestamp} ===`];

  for (const param of params) {
    lines.push(formatValue(param));
  }

  lines.push("");
  appendFileSync(LOG_FILE, lines.join("\n") + "\n", "utf-8");
};
