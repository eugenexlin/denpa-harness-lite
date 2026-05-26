import { getHomeDir } from "./manager";
import { resolve, isAbsolute } from "node:path";

const SENSITIVE_PATTERNS = [
  /\.ssh(\/|\\|$)/,
  /\.aws(\/|\\|$)/,
  /\.gnupg(\/|\\|$)/,
  /\.config(\/|\\|$)/,
  /\.env$/,
  /\.env\./,
  /[/\\]etc[/\\]/,
  /Windows\\System32/,
  /\.denpa(\/|\\|$)/,
];

const isWindows = process.platform === "win32";

const getAppDataDir = (): string | null => {
  if (isWindows) {
    return process.env.APPDATA || null;
  }
  return null;
};

export const isSensitivePath = (resolvedPath: string): boolean => {
  const normalized = resolvedPath.replace(/\\/g, "/");
  const homeDir = getHomeDir();

  const expanded = homeDir
    ? normalized.replace(/^~/, homeDir.replace(/\\/g, "/"))
    : normalized;

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(expanded)) {
      return true;
    }
  }

  const appData = getAppDataDir();
  if (appData && expanded.startsWith(appData.replace(/\\/g, "/"))) {
    return true;
  }

  return false;
};

export const getSensitivePathReason = (resolvedPath: string): string | null => {
  const normalized = resolvedPath.replace(/\\/g, "/");
  const homeDir = getHomeDir();
  const expanded = homeDir
    ? normalized.replace(/^~/, homeDir.replace(/\\/g, "/"))
    : normalized;

  if (/\.ssh(\/|\\|$)/.test(expanded)) return "SSH credentials directory";
  if (/\.aws(\/|\\|$)/.test(expanded)) return "AWS credentials directory";
  if (/\.gnupg(\/|\\|$)/.test(expanded)) return "GPG keys directory";
  if (/\.config(\/|\\|$)/.test(expanded)) return "Application config directory";
  if (/\.env$/.test(expanded) || /\.env\./.test(expanded)) return "Environment file (may contain secrets)";
  if (/[/\\]etc[/\\]/.test(expanded)) return "System configuration directory";
  if (/Windows\\System32/.test(expanded)) return "Windows system directory";
  if (/\.denpa(\/|\\|$)/.test(expanded)) return "Denpa harness configuration";

  const appData = getAppDataDir();
  if (appData && expanded.startsWith(appData.replace(/\\/g, "/"))) {
    return "Application data directory";
  }

  return null;
};
