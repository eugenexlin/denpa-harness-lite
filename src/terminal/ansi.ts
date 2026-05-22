// Cursor movement
export const ESC = '\x1b';

export const moveTo = (x: number, y: number): string => `${ESC}[${y};${x}H`;

export const moveUp = (n = 1): string => `${ESC}[${n}A`;

export const moveDown = (n = 1): string => `${ESC}[${n}B`;

export const moveForward = (n = 1): string => `${ESC}[${n}C`;

export const moveBack = (n = 1): string => `${ESC}[${n}D`;

// Clear
export const clearLine = (dir = 0): string => {
  // 0 = end, 1 = start, 2 = all
  return `${ESC}[${dir}K`;
};
export const clearScreen = (dir = 0): string => {
  // 0 = end, 1 = start, 2 = all
  return `${ESC}[${dir}J`;
};

export const clearFromCursor = (): string => `${ESC}[J`;

// Show/hide cursor
export const hideCursor = (): string => `${ESC}[?25l`;

export const showCursor = (): string => `${ESC}[?25h`;

// Save/restore cursor position
export const saveCursor = (): string => `${ESC}7`;

export const restoreCursor = (): string => `${ESC}8`;

// Colors and styling
export const ANSI_STYLE = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  italic: `${ESC}[3m`,
  underline: `${ESC}[4m`,
  blink: `${ESC}[5m`,
  reverse: `${ESC}[7m`,
  hidden: `${ESC}[8m`,

  fg: {
    black: `${ESC}[30m`,
    red: `${ESC}[31m`,
    green: `${ESC}[32m`,
    yellow: `${ESC}[33m`,
    blue: `${ESC}[34m`,
    magenta: `${ESC}[35m`,
    cyan: `${ESC}[36m`,
    white: `${ESC}[37m`,
    gray: `${ESC}[90m`,
  },

  bg: {
    black: `${ESC}[40m`,
    red: `${ESC}[41m`,
    green: `${ESC}[42m`,
    yellow: `${ESC}[43m`,
    blue: `${ESC}[44m`,
    magenta: `${ESC}[45m`,
    cyan: `${ESC}[46m`,
    white: `${ESC}[47m`,
  },
} as const;

export const color = (text: string, code: string): string => `${code}${text}${ANSI_STYLE.reset}`;

export const gray = (text: string): string => color(text, ANSI_STYLE.fg.gray);

export const red = (text: string): string => color(text, ANSI_STYLE.fg.red);

export const green = (text: string): string => color(text, ANSI_STYLE.fg.green);

export const yellow = (text: string): string => color(text, ANSI_STYLE.fg.yellow);

export const cyan = (text: string): string => color(text, ANSI_STYLE.fg.cyan);

export const bold = (text: string): string => color(text, ANSI_STYLE.bold);

// Spinner
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const spinner = (frame: number, text: string): string => `${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]} ${text}`;

// Alternative simple spinner
export const SIMPLE_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Line drawing
export const box = {
  horizontal: "─",
  vertical: "│",
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  verticalLeft: "├",
  verticalRight: "┤",
  horizontalTop: "┬",
  horizontalBottom: "┴",
  cross: "┼",
};

export const separator = (width: number, char = "─"): string => char.repeat(width);

export const stripAnsi = (text: string): string =>
  text.replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, "");
