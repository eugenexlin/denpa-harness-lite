import { describe, it, expect } from "bun:test";
import { charWidth, isBreakableWhitespace, visualWidth } from "./col-width";

describe("charWidth", () => {
  describe("single-width characters", () => {
    it("returns 1 for basic ASCII letters", () => {
      expect(charWidth("a".codePointAt(0)!)).toBe(1);
      expect(charWidth("Z".codePointAt(0)!)).toBe(1);
    });

    it("returns 1 for digits", () => {
      expect(charWidth("0".codePointAt(0)!)).toBe(1);
      expect(charWidth("9".codePointAt(0)!)).toBe(1);
    });

    it("returns 1 for punctuation", () => {
      expect(charWidth("!".codePointAt(0)!)).toBe(1);
      expect(charWidth("?".codePointAt(0)!)).toBe(1);
    });

    it("returns 1 for spaces", () => {
      expect(charWidth(" ".codePointAt(0)!)).toBe(1);
    });
  });

  describe("double-width characters", () => {
    it("returns 2 for CJK Unified Ideographs", () => {
      expect(charWidth("中".codePointAt(0)!)).toBe(2);
      expect(charWidth("文".codePointAt(0)!)).toBe(2);
      expect(charWidth("字".codePointAt(0)!)).toBe(2);
    });

    it("returns 2 for Hiragana", () => {
      expect(charWidth("あ".codePointAt(0)!)).toBe(2);
      expect(charWidth("い".codePointAt(0)!)).toBe(2);
    });

    it("returns 2 for Katakana", () => {
      expect(charWidth("ア".codePointAt(0)!)).toBe(2);
      expect(charWidth("イ".codePointAt(0)!)).toBe(2);
    });

    it("returns 2 for Hangul", () => {
      expect(charWidth("한".codePointAt(0)!)).toBe(2);
      expect(charWidth("글".codePointAt(0)!)).toBe(2);
    });

    it("returns 2 for fullwidth ASCII variants", () => {
      expect(charWidth("Ａ".codePointAt(0)!)).toBe(2);
      expect(charWidth("Ｚ".codePointAt(0)!)).toBe(2);
    });

    it("returns 2 for box drawing characters", () => {
      expect(charWidth("─".codePointAt(0)!)).toBe(2);
      expect(charWidth("│".codePointAt(0)!)).toBe(2);
      expect(charWidth("┌".codePointAt(0)!)).toBe(2);
      expect(charWidth("┐".codePointAt(0)!)).toBe(2);
    });

    it("returns 2 for emoji", () => {
      expect(charWidth("😀".codePointAt(0)!)).toBe(2);
      expect(charWidth("🚀".codePointAt(0)!)).toBe(2);
    });
  });

  describe("zero-width characters", () => {
    it("returns 0 for combining diacritical marks", () => {
      expect(charWidth(0x0300)).toBe(0);
      expect(charWidth(0x0301)).toBe(0);
    });

    it("returns 0 for zero-width joiner", () => {
      expect(charWidth(0x200d)).toBe(0);
    });

    it("returns 0 for zero-width non-joiner", () => {
      expect(charWidth(0x200c)).toBe(0);
    });

    it("returns 0 for BOM", () => {
      expect(charWidth(0xfeff)).toBe(0);
    });
  });
});

describe("isBreakableWhitespace", () => {
  it("returns true for space", () => {
    expect(isBreakableWhitespace(0x20)).toBe(true);
  });

  it("returns true for tab", () => {
    expect(isBreakableWhitespace(0x09)).toBe(true);
  });

  it("returns true for ideographic space", () => {
    expect(isBreakableWhitespace(0x3000)).toBe(true);
  });

  it("returns false for newline", () => {
    expect(isBreakableWhitespace(0x0a)).toBe(false);
  });

  it("returns false for regular characters", () => {
    expect(isBreakableWhitespace("a".codePointAt(0)!)).toBe(false);
    expect(isBreakableWhitespace(" ".codePointAt(0)!)).toBe(true);
  });
});

describe("visualWidth", () => {
  describe("plain strings", () => {
    it("returns 0 for empty string", () => {
      expect(visualWidth("")).toBe(0);
    });

    it("returns correct width for ASCII text", () => {
      expect(visualWidth("hello")).toBe(5);
      expect(visualWidth("hello world")).toBe(11);
    });

    it("returns correct width for CJK text", () => {
      expect(visualWidth("中文")).toBe(4);
      expect(visualWidth("あいう")).toBe(6);
    });

    it("returns correct width for mixed ASCII and CJK", () => {
      expect(visualWidth("hello中文")).toBe(9);
      expect(visualWidth("a中b")).toBe(4);
    });
  });

  describe("ANSI escape sequences - standard", () => {
    it("strips basic color codes at start", () => {
      expect(visualWidth("\x1b[31mhello\x1b[0m")).toBe(5);
    });

    it("strips color codes in the middle", () => {
      expect(visualWidth("he\x1b[31my\x1b[0mworld")).toBe(8);
    });

    it("strips color codes at end", () => {
      expect(visualWidth("hello\x1b[31m")).toBe(5);
    });

    it("strips multiple ANSI sequences", () => {
      expect(visualWidth("\x1b[31m\x1b[1m\x1b[4mhello")).toBe(5);
    });

    it("strips complex multi-parameter sequences", () => {
      expect(visualWidth("\x1b[1;31;43mhello\x1b[0m")).toBe(5);
    });

    it("returns 0 for string with only ANSI codes", () => {
      expect(visualWidth("\x1b[31m\x1b[0m")).toBe(0);
    });
  });

  describe("ANSI escape sequences - RGB format", () => {
    it("strips background RGB color codes", () => {
      expect(visualWidth("\x1b[48;2;33;33;33mhello\x1b[0m")).toBe(5);
    });

    it("strips foreground RGB color codes", () => {
      expect(visualWidth("\x1b[38;2;255;128;0mhello\x1b[0m")).toBe(5);
    });

    it("strips RGB codes in the middle of text", () => {
      expect(visualWidth("he\x1b[48;2;255;0;0my\x1b[0mworld")).toBe(8);
    });

    it("strips multiple RGB sequences", () => {
      expect(visualWidth("\x1b[48;2;0;0;0m\x1b[38;2;255;255;255mhello\x1b[0m")).toBe(5);
    });

    it("strips RGB codes at end of text", () => {
      expect(visualWidth("hello\x1b[48;2;100;100;100m")).toBe(5);
    });

    it("handles RGB codes with CJK text", () => {
      expect(visualWidth("\x1b[38;2;255;0;0m中文\x1b[0m")).toBe(4);
    });

    it("handles mixed RGB and standard ANSI codes", () => {
      expect(visualWidth("\x1b[48;2;33;33;33m\x1b[1mhello\x1b[0m")).toBe(5);
    });

    it("returns 0 for string with only RGB ANSI codes", () => {
      expect(visualWidth("\x1b[48;2;255;128;0m\x1b[0m")).toBe(0);
    });

    it("handles RGB code with all 255 values", () => {
      expect(visualWidth("\x1b[38;2;255;255;255mwhite\x1b[0m")).toBe(5);
    });

    it("handles RGB code with all 0 values", () => {
      expect(visualWidth("\x1b[38;2;0;0;0mblack\x1b[0m")).toBe(5);
    });

    it("handles multiple RGB sequences interleaved with text", () => {
      const text = "\x1b[38;2;255;0;0mred\x1b[38;2;0;255;0mgreen\x1b[38;2;0;0;255mblue\x1b[0m";
      expect(visualWidth(text)).toBe(12);
    });

    it("handles RGB background with foreground RGB", () => {
      const text = "\x1b[48;2;0;0;0m\x1b[38;2;255;255;255mhello world\x1b[0m";
      expect(visualWidth(text)).toBe(11);
    });
  });

  describe("ANSI escape sequences - edge cases", () => {
    it("handles cursor movement codes", () => {
      expect(visualWidth("\x1b[10;20Hhello")).toBe(5);
    });

    it("handles scroll lock codes", () => {
      expect(visualWidth("\x1b[5;10rhello")).toBe(5);
    });

    it("handles clear screen codes", () => {
      expect(visualWidth("\x1b[2Jhello")).toBe(5);
    });

    it("handles cursor show/hide codes", () => {
      // ANSI_REGEX doesn't strip \x1b[?25l/h (contains '?'), so full string counted
      expect(visualWidth("\x1b[?25lhello\x1b[?25h")).toBe(17);
    });

    it("handles save/restore cursor codes", () => {
      // ANSI_REGEX doesn't strip \x1b7/\x1b8 (no '[' after ESC), so full string counted
      expect(visualWidth("\x1b7hello\x1b8")).toBe(9);
    });

    it("handles ANSI codes with CJK and zero-width chars", () => {
      expect(visualWidth("\x1b[31m中\x1b[0m")).toBe(2);
    });
  });
});
