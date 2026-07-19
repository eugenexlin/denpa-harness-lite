import { ANSI, wrapFgRgb } from "../terminal/ansi";
import { wrapText } from "../terminal/wrap";

//const THOUGHT_PREFIX = `${ANSI.fg.magenta}┃${ANSI.fg.default} `;
const THOUGHT_PREFIX = wrapFgRgb(ANSI.color_ref.thinking, "┃");

export const formatThinking = (text: string, colPos: number): string => {
  const cols = process.stdout.columns || 80;
  const wrap = cols - 4;

  const startPos = Math.max(1, colPos - 2);

  const wrapTextResult = wrapText(text, startPos, wrap);
  let out = "";
  if (startPos === 1) {
    // we must be at the very left. lets just add the first thing
    out += THOUGHT_PREFIX;
  }

  wrapTextResult.textLines.forEach((line, index) => {
    if (index > 0) {
      out += THOUGHT_PREFIX;
    }
    out += `${ANSI.dim}${line}${ANSI.disable.dim}`;
    if (index < wrapTextResult.textLines.length - 1) {
      out += "\n";
    }
  });

  return out;
};
