import { ANSI_STYLE, clearLine } from "../terminal/ansi";
import { wrapText } from "../terminal/wrap";
import { getSandKeyFrame } from "./drop-animation";

export type PanelToken = { type: "full-width-rule" };
export type PanelLine = string | PanelToken;
export const FULL_WIDTH_RULE: PanelToken = { type: "full-width-rule" };

export interface PanelProps {
  isThinking: boolean;
  isStreaming: boolean;
  startTime: number;
  userInputWithAnsiCursor: string;
}

export const formatUserInputPanel = (input: string): string[] => {
  const cols = process.stdout.columns || 80;
  const wrapWidth = cols - 4;
  const wrapTextResult = wrapText(input, 1, wrapWidth);

  const lines = [
    `${ANSI_STYLE.bg.gray900}${clearLine()}${ANSI_STYLE.reset}`,
    ...wrapTextResult.textLines.map(
      (line, i) =>
        `${ANSI_STYLE.bg.gray900}${clearLine()}${i == 0 ? " ❯ " : "   "}${line}${ANSI_STYLE.reset}`,
    ),
    `${ANSI_STYLE.bg.gray900}${clearLine()}${ANSI_STYLE.reset}`,
  ];

  return lines;
};

export const renderPanel = (props: PanelProps): PanelLine[] => {
  const result: PanelLine[] = [];
  //prefix
  if (props.isThinking) {
    result.push(
      `${ANSI_STYLE.fg.magenta}${getSandKeyFrame()}Thinking${ANSI_STYLE.reset}\n\n`,
    );
  }

  //user input always shown.
  result.push(...formatUserInputPanel(props.userInputWithAnsiCursor));

  return result;
};
