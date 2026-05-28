import { stripAnsi } from "./ansi";

const DOUBLE_WIDTH_RANGES: [number, number][] = [
  // CJK Unified Ideographs + Extension A–G
  [0x4e00, 0x9fff],
  [0x3400, 0x4dbf],
  [0x20000, 0x2a6df],
  [0x2a700, 0x2b73f],
  [0x2b740, 0x2b81f],
  [0x2b820, 0x2ceaf],
  [0x2ceb0, 0x2ebef],
  // CJK Radicals Supplement, Kangxi Radicals, Strokes
  [0x2e80, 0x2eff],
  [0x2f00, 0x2fdf],
  [0x31c0, 0x31ef],
  // CJK Symbols & Punctuation, Ideographic Description Characters
  [0x3000, 0x303f],
  [0x3297, 0x329f],
  // Hiragana, Katakana
  [0x3040, 0x309f],
  [0x30a0, 0x30ff],
  // Halfwidth Katakana (double-width variants)
  [0xff61, 0xff9f],
  // Hangul Syllables, Jamo
  [0xac00, 0xd7af],
  [0x1100, 0x115f],
  [0x3130, 0x318f],
  // CJK Compatibility Ideographs
  [0xf900, 0xfaff],
  [0x2f800, 0x2fa1f],
  // Enclosed CJK Letters & Months
  [0x3200, 0x32ff],
  // CJK Compatibility Forms, Small Form Variants
  [0xfe30, 0xfe4f],
  // Box Drawing, Block Elements, Geometric Shapes
  [0x2500, 0x257f],
  [0x2580, 0x259f],
  [0x25a0, 0x25ff],
  // Braille Patterns
  [0x2800, 0x28ff],
  // Misc Symbols, Dingbats
  [0x2600, 0x26ff],
  [0x2700, 0x27bf],
  // Emoticons / Emoji
  [0x1f300, 0x1f5ff],
  [0x1f600, 0x1f64f],
  [0x1f680, 0x1f6ff],

  //Colored Emoji Shapes
  [0x1f7e0, 0x1f7eb],
  [0x1f7f0, 0x1f7f0],

  //Supplemental Symbols and Pictographs
  [0x1f900, 0x1f9ff],
  // Chess Symbols
  [0x1fa00, 0x1fa6f],
  // Symbols and Pictographs Extended-A
  [0x1fa70, 0x1faff],
  // Fullwidth ASCII variants
  [0xff01, 0xff5e],
];

const ZERO_WIDTH_SCALARS = new Set([
  0x034f, 0x110bd, 0x110cd, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0xfeff,
]);

const ZERO_WIDTH_RANGES: [number, number][] = [
  [0x0300, 0x036f],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe20, 0xfe2f],
];

const isInRange = (code: number, ranges: [number, number][]): boolean => {
  for (const [start, end] of ranges) {
    if (code >= start && code <= end) return true;
  }
  return false;
};

export const charWidth = (codePoint: number): number => {
  if (
    ZERO_WIDTH_SCALARS.has(codePoint) ||
    isInRange(codePoint, ZERO_WIDTH_RANGES)
  )
    return 0;
  if (isInRange(codePoint, DOUBLE_WIDTH_RANGES)) return 2;
  return 1;
};

const BREAKABLE_WHITESPACE = new Set([
  0x09, // tab
  0x20, // space
  0x3000, // ideographic space
]);

export const isBreakableWhitespace = (codePoint: number): boolean => {
  return BREAKABLE_WHITESPACE.has(codePoint);
};

export const visualWidth = (str: string): number => {
  let width = 0;
  const strippedStr = stripAnsi(str);
  for (const codePoint of strippedStr) {
    width += charWidth(codePoint.codePointAt(0)!);
  }
  return width;
};
