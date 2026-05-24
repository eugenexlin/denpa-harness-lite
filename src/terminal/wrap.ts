import { ANSI_REGEX } from "./ansi";
import { visualWidth, charWidth, isBreakableWhitespace } from "./col-width";

export interface WrapTextResult {
  textLines: string[];
  rowIncrementCount: number;
  newColumn: number;
}

const wrapLine = (line: string, maxWidth: number): [string, string] => {
  if (visualWidth(line) <= maxWidth) {
    return [line, ""];
  }

  let width = 0;
  let lastBreakOffset = 0;
  let offset = 0;
  let ansiOffset = 0;

  ANSI_REGEX.lastIndex = 0;
  let ansiMatch = ANSI_REGEX.exec(line);

  for (let i = 0; i < line.length; i++) {
    if (ansiMatch && i === ansiMatch.index) {
      i += ansiMatch[0].length - 1;
      ansiOffset += ansiMatch[0].length;
      ansiMatch = ANSI_REGEX.exec(line);
      continue;
    }

    const char = line.charAt(i);
    const codePoint = char.codePointAt(0)!;
    const w = charWidth(codePoint);

    if (width + w > maxWidth) {
      if (lastBreakOffset > 0) {
        return [line.slice(0, lastBreakOffset), line.slice(lastBreakOffset)];
      }
      return [line.slice(0, offset), line.slice(offset)];
    }

    width += w;
    if (ansiOffset >= 0) {
      offset += ansiOffset;
      ansiOffset = 0;
    }
    offset += char.length;
    if (isBreakableWhitespace(codePoint)) {
      lastBreakOffset = offset;
    }
  }

  return [line, ""];
};

export const wrapText = (
  text: string,
  leftMargin: number,
  startCursor: number,
  cols: number = process.stdout.columns ?? 80,
): WrapTextResult => {
  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const isFirstLine = i === 0;
    const lineAvailableWidth = isFirstLine
      ? Math.max(1, cols - startCursor)
      : Math.max(1, cols - leftMargin);

    let remaining = line;
    let isContinuation = false;

    while (true) {
      const currentAvailableWidth = isContinuation
        ? Math.max(1, cols - leftMargin)
        : lineAvailableWidth;

      const [part, rest] = wrapLine(remaining, currentAvailableWidth);
      result.push(part);

      if (!rest) break;
      remaining = rest;
      isContinuation = true;
    }
  }

  const lastLine = result[result.length - 1] ?? "";
  const newColumn = visualWidth(lastLine);

  return {
    textLines: result,
    rowIncrementCount: result.length - 1,
    newColumn,
  };
};
