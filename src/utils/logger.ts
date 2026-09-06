import { logFile } from "./debug-logger";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogSink {
  write: (level: LogLevel, message: string) => void;
}

const formatParam = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const formatParams = (params: unknown[]): string =>
  params.map(formatParam).join(" ");

const defaultSink: LogSink = {
  write: (level, message) => {
    const stream =
      level === "error" || level === "warn" ? process.stderr : process.stdout;
    stream.write(message + "\n");
  },
};

let sink: LogSink = defaultSink;
let fileLoggingEnabled = true;

export const setLogSink = (next: LogSink): void => {
  sink = next;
};

export const setFileLoggingEnabled = (enabled: boolean): void => {
  fileLoggingEnabled = enabled;
};

const emit = (level: LogLevel, params: unknown[]): void => {
  const message = formatParams(params);
  if (fileLoggingEnabled) {
    logFile(`[${level}] ${message}`);
  }
  sink.write(level, message);
};

export const logger = {
  debug: (...params: unknown[]): void => emit("debug", params),
  info: (...params: unknown[]): void => emit("info", params),
  warn: (...params: unknown[]): void => emit("warn", params),
  error: (...params: unknown[]): void => emit("error", params),
};
