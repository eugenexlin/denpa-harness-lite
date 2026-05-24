// Cursor movement
export const ESC = "\x1b";

export const moveTo = (row: number, col: number): string =>
  `${ESC}[${row};${col}H`;

export const lockScroll = (startRow: number, endRow: number): string =>
  `${ESC}[${startRow};${endRow}r`;
export const resetScroll = (): string => `${ESC}[r`;

export const moveUp = (n = 1): string => `${ESC}[${n}A`;

export const moveDown = (n = 1): string => `${ESC}[${n}B`;

export const moveForward = (n = 1): string => `${ESC}[${n}C`;

export const moveBack = (n = 1): string => `${ESC}[${n}D`;

// Clear
export const clearLine = (dir = 2): string => {
  // 0 = end, 1 = start, 2 = all
  return `${ESC}[${dir}K`;
};


export const clearScreen = (dir = 2): string => {
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

export const RGB_COLOR = {
  gray100: `247;247;247`,
  gray200: `229;229;229`,
  gray300: `212;212;212`,
  gray400: `163;163;163`,
  gray500: `115;115;115`,
  gray600: `82;82;82`,
  gray700: `64;64;64`,
  gray800: `45;45;45`,
  gray900: `33;33;33`,
};

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

  disable: {
    bold: `${ESC}[21m`,
    dim: `${ESC}[22m`,
    italic: `${ESC}[23m`,
    underline: `${ESC}[24m`,
    blink: `${ESC}[25m`,
    reverse: `${ESC}[27m`,
    hidden: `${ESC}[28m`,
  },

  fg: {
    black: `${ESC}[30m`,
    red: `${ESC}[31m`,
    green: `${ESC}[32m`,
    yellow: `${ESC}[33m`,
    blue: `${ESC}[34m`,
    magenta: `${ESC}[35m`,
    cyan: `${ESC}[36m`,
    white: `${ESC}[37m`,
    default: `${ESC}[39m`,
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
    default: `${ESC}[49m`,
    gray900: `${ESC}[48;2;${RGB_COLOR.gray900}m`,
  },
} as const;

export const setBgColor = (rgbColor: string) => {
  if (!/^\d+;\d+;\d+$/.test(rgbColor)) {
    throw new Error(
      `Invalid RGB color format: "${rgbColor}". Expected "R;G;B" (e.g., "255;128;0")`,
    );
  }
  return `${ESC}[48;2;${rgbColor}m`;
};

export const fgColor = (text: string, code: string): string =>
  `${code}${text}${ANSI_STYLE.fg.default}`;

export const fgGray = (text: string): string => fgColor(text, ANSI_STYLE.fg.gray);

export const fgRed = (text: string): string => fgColor(text, ANSI_STYLE.fg.red);

export const fgGreen = (text: string): string => fgColor(text, ANSI_STYLE.fg.green);

export const fgYellow = (text: string): string =>
  fgColor(text, ANSI_STYLE.fg.yellow);

export const fgCyan = (text: string): string => fgColor(text, ANSI_STYLE.fg.cyan);

export const bold = (text: string): string => fgColor(text, ANSI_STYLE.bold);

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

export const separator = (width: number, char = "─"): string =>
  char.repeat(width);

export const ANSI_REGEX = /\x1b\[[;\d]*[A-Za-z]/g;

export const stripAnsi = (text: string): string => text.replace(ANSI_REGEX, "");
