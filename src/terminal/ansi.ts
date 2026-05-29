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

const color = {
  red100: "255;205;210",
  red200: "239;154;154",
  red300: "229;115;115",
  red400: "239;83;80",
  red500: "244;67;54",
  red600: "229;57;53",
  red700: "211;47;47",
  red800: "198;40;40",
  red900: "183;28;28",

  green100: "200;230;201",
  green200: "165;214;167",
  green300: "129;199;132",
  green400: "102;187;106",
  green500: "76;175;80",
  green600: "67;160;71",
  green700: "56;142;60",
  green800: "46;125;50",
  green900: "27;94;32",

  blue100: `187;222;251`,
  blue200: `144;202;249`,
  blue300: `100;181;246`,
  blue400: `66;165;245`,
  blue500: `33;150;243`,
  blue600: `30;136;229`,
  blue700: `25;118;210`,
  blue800: `21;101;192`,
  blue900: `13;71;161`,

  amber100: `255;236;179`,
  amber200: `255;224;130`,
  amber300: `255;213;79`,
  amber400: `255;202;40`,
  amber500: `255;193;7`,
  amber600: `255;179;0`,
  amber700: `255;160;0`,
  amber800: `255;143;0`,
  amber900: `255;111;0`,

  purple100: "225;190;231",
  purple200: "206;147;216",
  purple300: "186;104;200",
  purple400: "171;71;188",
  purple500: "156;39;176",
  purple600: "142;36;170",
  purple700: "123;31;162",
  purple800: "106;27;154",
  purple900: "74;20;140",

  teal100: "178;223;219",
  teal200: "128;203;196",
  teal300: "77;182;172",
  teal400: "38;166;154",
  teal500: "0;150;136",
  teal600: "0;137;123",
  teal700: "0;121;107",
  teal800: "0;105;92",
  teal900: "0;77;64",

  brown100: "215;204;200",
  brown200: "188;170;164",
  brown300: "161;136;127",
  brown400: "141;110;99",
  brown500: "121;85;72",
  brown600: "109;76;65",
  brown700: "93;64;55",
  brown800: "78;52;46",
  brown900: "62;39;35",

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
export const ANSI = {
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
  },

  color: color,

  color_ref: {
    thinking: color.purple600,
    read_only: color.amber600,
    read_write: color.teal500,
    tool: color.brown500,
  },
} as const;

const validateRGB = (rgbColor: string) => {
  if (!/^\d+;\d+;\d+$/.test(rgbColor)) {
    throw new Error(
      `Invalid RGB color format: "${rgbColor}". Expected "R;G;B" (e.g., "255;128;0")`,
    );
  }
};

export const fgRgb = (rgbColor: string) => {
  validateRGB(rgbColor);
  return `${ESC}[38;2;${rgbColor}m`;
};
export const wrapFgRgb = (rgbColor: string, text: string) => {
  return `${fgRgb(rgbColor)}${text}${ANSI.fg.default}`;
};
export const bgRgb = (rgbColor: string) => {
  validateRGB(rgbColor);
  return `${ESC}[48;2;${rgbColor}m`;
};
export const lineBgRgb = (rgbColor: string) => {
  validateRGB(rgbColor);
  return `${bgRgb(rgbColor)}${clearLine()}`;
};
export const wrapBgRgb = (rgbColor: string, text: string) => {
  return `${bgRgb(rgbColor)}${text}${ANSI.bg.default}`;
};

export const bold = (text: string): string => {
  return `${ANSI.bold}${text}${ANSI.disable.bold}`;
};

export const ANSI_REGEX = /\x1b\[[;\d]*[A-Za-z]/g;

export const stripAnsi = (text: string): string => text.replace(ANSI_REGEX, "");
