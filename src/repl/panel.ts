import { ANSI, clearLine, lineBgRgb, bgRgb, wrapFgRgb } from "../terminal/ansi";
import { wrapText } from "../terminal/wrap";
import { getSandKeyFrame } from "./drop-animation";
import type { InternalToolDefinition } from "../agent/tool/internal";
import { CHARS } from "../terminal/special-chars";

export type PanelToken = { type: "full-width-rule" };
export type PanelLine = string | PanelToken;
export const FULL_WIDTH_RULE: PanelToken = { type: "full-width-rule" };

export type PanelMode = "input" | "tool-approval";

export interface PanelProps {
  mode: PanelMode;
  llmModel: string;
  llmModelId?: string;
  isReadonlyMode: boolean;
  isThinking: boolean;
  isStreaming: boolean;
  startTime: number;
  userInputWithAnsiCursor: string;
  toolName?: string;
  toolDefinition?: InternalToolDefinition;
  toolArgs?: Record<string, unknown>;
}

export const formatUserInputPanel = (
  input: string,
  panelFooter?: string[],
): string[] => {
  const cols = process.stdout.columns || 80;
  const wrapWidth = cols - 4;
  const wrapTextResult = wrapText(input, 1, wrapWidth);

  const lines = [
    `${lineBgRgb(ANSI.color.gray900)}${ANSI.bg.default}`,
    ...wrapTextResult.textLines.map(
      (line, i) =>
        `${lineBgRgb(ANSI.color.gray900)}${i == 0 ? " ❯ " : "   "}${line}${ANSI.bg.default}`,
    ),
    `${lineBgRgb(ANSI.color.gray900)}${ANSI.bg.default}`,
    ...(panelFooter ?? []).map((line) => {
      return `${lineBgRgb(ANSI.color.gray900)}${line}${ANSI.bg.default}`;
    }),
  ];

  return lines;
};

export const renderToolApprovalPanel = (
  toolName: string,
  definition: InternalToolDefinition,
  args: Record<string, unknown>,
): PanelLine[] => {
  const cols = process.stdout.columns || 80;
  const lines: PanelLine[] = [];

  const header = `${ANSI.fg.yellow}${ANSI.bold}⚠ Tool '${toolName}' requires approval${ANSI.bg.default}`;
  lines.push(`${bgRgb(ANSI.color.gray900)}${clearLine()}${ANSI.bg.default}`);
  lines.push(
    `${bgRgb(ANSI.color.gray900)}${clearLine()} ${header}${ANSI.bg.default}`,
  );

  if (definition.description) {
    const descLines = wrapText(
      `  ${definition.description}`,
      1,
      cols - 2,
    ).textLines;
    for (const line of descLines) {
      lines.push(
        `${bgRgb(ANSI.color.gray900)}${clearLine()}${line}${ANSI.bg.default}`,
      );
    }
  }

  const argEntries = Object.entries(args);
  if (argEntries.length > 0) {
    for (const [key, value] of argEntries) {
      const valueStr =
        typeof value === "string" ? value : JSON.stringify(value);
      const truncated =
        valueStr.length > cols - 20
          ? valueStr.slice(0, cols - 23) + "..."
          : valueStr;
      const argLine = `  ${ANSI.fg.cyan}${key}${ANSI.reset}: ${truncated}`;
      lines.push(
        `${bgRgb(ANSI.color.gray900)}${clearLine()}${argLine}${ANSI.bg.default}`,
      );
    }
  }

  const hint = `${ANSI.fg.green}y${ANSI.reset}=approve once  ${ANSI.fg.green}Y${ANSI.reset}=approve always  ${ANSI.fg.red}n${ANSI.reset}=deny`;
  lines.push(
    `${bgRgb(ANSI.color.gray900)}${clearLine()} ${hint}${ANSI.bg.default}`,
  );
  lines.push(`${bgRgb(ANSI.color.gray900)}${clearLine()}${ANSI.bg.default}`);

  return lines;
};

// important note, 1 panel line should be 1 line by now, no \n allowed
export const renderPanel = (props: PanelProps): PanelLine[] => {
  const result: PanelLine[] = [];

  if (
    props.mode === "tool-approval" &&
    props.toolName &&
    props.toolDefinition
  ) {
    return renderToolApprovalPanel(
      props.toolName,
      props.toolDefinition,
      props.toolArgs ?? {},
    );
  }

  if (props.isThinking) {
    result.push(
      wrapFgRgb(ANSI.color_ref.thinking, `${getSandKeyFrame()}Thinking`),
    );
  }

  // main panel
  // and extra footer
  let footer = " ";
  footer += props.isReadonlyMode
    ? wrapFgRgb(ANSI.color_ref.read_only, "Read")
    : wrapFgRgb(ANSI.color_ref.read_write, "Write");
  footer += ` ${CHARS.separator} `;
  footer += props.llmModel;
  if (props.llmModelId) {
    footer += ` ${ANSI.dim}${props.llmModelId}${ANSI.disable.dim}`;
  }

  result.push(...formatUserInputPanel(props.userInputWithAnsiCursor, [footer]));
  //

  return result;
};
