import { CHARS } from "../terminal/special-chars";

export const formatDuration = (ms: number): string => {
  const totalSeconds = Math.max(1, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join("");
};

export const formatRequestMetricLine = (
  elapsedTimespan: number,
  tokenIn: number,
  tokenOut: number,
) => {
  let result = "";
  result = formatDuration(elapsedTimespan);
  if (tokenIn > 0) {
    result += ` ${CHARS.separator} in:${tokenIn}`;
  }
  if (tokenOut > 0) {
    result += ` ${CHARS.separator} out:${tokenOut}`;
  }
  return result;
};
