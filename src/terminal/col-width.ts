const DOUBLE_WIDTH_RANGES: [number, number][] = [
  // CJK Unified Ideographs + Extension A–G
  [0x4E00, 0x9FFF],
  [0x3400, 0x4DBF],
  [0x20000, 0x2A6DF],
  [0x2A700, 0x2B73F],
  [0x2B740, 0x2B81F],
  [0x2B820, 0x2CEAF],
  [0x2CEB0, 0x2EBEF],
  // CJK Radicals Supplement, Kangxi Radicals, Strokes
  [0x2E80, 0x2EFF],
  [0x2F00, 0x2FDF],
  [0x31C0, 0x31EF],
  // CJK Symbols & Punctuation, Ideographic Description Characters
  [0x3000, 0x303F],
  [0x3297, 0x329F],
  // Hiragana, Katakana
  [0x3040, 0x309F],
  [0x30A0, 0x30FF],
  // Halfwidth Katakana (double-width variants)
  [0xFF61, 0xFF9F],
  // Hangul Syllables, Jamo
  [0xAC00, 0xD7AF],
  [0x1100, 0x115F],
  [0x3130, 0x318F],
  // CJK Compatibility Ideographs
  [0xF900, 0xFAFF],
  [0x2F800, 0x2FA1F],
  // Enclosed CJK Letters & Months
  [0x3200, 0x32FF],
  // CJK Compatibility Forms, Small Form Variants
  [0xFE30, 0xFE4F],
  // Box Drawing, Block Elements, Geometric Shapes
  [0x2500, 0x257F],
  [0x2580, 0x259F],
  [0x25A0, 0x25FF],
  // Braille Patterns
  [0x2800, 0x28FF],
  // Misc Symbols, Dingbats
  [0x2600, 0x26FF],
  [0x2700, 0x27BF],
  // Emoticons / Emoji
  [0x1F300, 0x1F5FF],
  [0x1F600, 0x1F64F],
  [0x1F680, 0x1F6FF],
  [0x1F900, 0x1F9FF],
  [0x1FA00, 0x1FA6F],
  [0x1FA70, 0x1FAFF],
  // Fullwidth ASCII variants
  [0xFF01, 0xFF5E],
];

const ZERO_WIDTH_SCALARS = new Set([
  0x034F, 0x110BD, 0x110CD,
  0x200C, 0x200D, 0x200E, 0x200F, 0x2060, 0xFEFF,
]);

const ZERO_WIDTH_RANGES: [number, number][] = [
  [0x0300, 0x036F],
  [0x1DC0, 0x1DFF],
  [0x20D0, 0x20FF],
  [0xFE20, 0xFE2F],
];

const isInRange = (code: number, ranges: [number, number][]): boolean => {
  for (const [start, end] of ranges) {
    if (code >= start && code <= end) return true;
  }
  return false;
};

export const charWidth = (codePoint: number): number => {
  if (ZERO_WIDTH_SCALARS.has(codePoint) || isInRange(codePoint, ZERO_WIDTH_RANGES)) return 0;
  if (isInRange(codePoint, DOUBLE_WIDTH_RANGES)) return 2;
  return 1;
};

const BREAKABLE_WHITESPACE = new Set([
  0x09,  // tab
  0x20,  // space
  0x3000, // ideographic space
]);

export const isBreakableWhitespace = (codePoint: number): boolean => {
  return BREAKABLE_WHITESPACE.has(codePoint);
};

export const visualWidth = (str: string): number => {
  let width = 0;
  for (const codePoint of str) {
    width += charWidth(codePoint.codePointAt(0)!);
  }
  return width;
};
