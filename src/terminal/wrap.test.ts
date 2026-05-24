import { describe, it, expect } from "bun:test";
import { wrapText } from "./wrap";
import { ANSI_REGEX, ANSI_STYLE } from "./ansi";
import { logFile } from "../debug-logger";

describe("wrapText", () => {
  describe("basic wrapping", () => {
    it("returns unchanged text when it fits", () => {
      const result = wrapText("hello", 2, 0, 80);
      expect(result.textLines).toEqual(["hello"]);
      expect(result.rowIncrementCount).toBe(0);
      expect(result.newColumn).toBe(5);
    });

    it("wraps text at whitespace boundary", () => {
      const result = wrapText("hello world", 2, 0, 10);
      expect(result.textLines).toEqual(["hello ", "world"]);
      expect(result.rowIncrementCount).toBe(1);
      expect(result.newColumn).toBe(5);
    });

    it("wraps text at column limit when no whitespace available", () => {
      // startCursor=0, so availableWidth = 10 - 0 = 10
      // "helloxworld" has width 11 > 10, break at 10
      const result = wrapText("helloxworld", 2, 0, 10);
      expect(result.textLines).toEqual(["helloxworl", "d"]);
      expect(result.rowIncrementCount).toBe(1);
      expect(result.newColumn).toBe(1);
    });

    it("handles empty text", () => {
      const result = wrapText("", 2, 0, 80);
      expect(result.textLines).toEqual([""]);
      expect(result.rowIncrementCount).toBe(0);
      expect(result.newColumn).toBe(0);
    });

    it("handles single character", () => {
      const result = wrapText("a", 2, 0, 80);
      expect(result.textLines).toEqual(["a"]);
      expect(result.rowIncrementCount).toBe(0);
      expect(result.newColumn).toBe(1);
    });

    it("handles text that exactly fits", () => {
      const result = wrapText("hello", 2, 0, 7);
      expect(result.textLines).toEqual(["hello"]);
      expect(result.rowIncrementCount).toBe(0);
      expect(result.newColumn).toBe(5);
    });
  });

  describe("cursor tracking", () => {
    it("accounts for midstream startCursor when text fits", () => {
      const result = wrapText("hello", 2, 5, 80);
      expect(result.textLines).toEqual(["hello"]);
      expect(result.rowIncrementCount).toBe(0);
      expect(result.newColumn).toBe(5);
    });

    it("wraps when startCursor leaves insufficient space", () => {
      // startCursor=75, availableWidth = 80 - 75 = 5
      // "hello" fits (5), " world" continues at leftMargin=2, available=78
      const result = wrapText("hello world", 2, 75, 80);
      expect(result.textLines).toEqual(["hello", " world"]);
      expect(result.rowIncrementCount).toBe(1);
    });

    it("resets to leftMargin for subsequent lines", () => {
      const result = wrapText("hello world", 2, 75, 80);
      expect(result.newColumn).toBe(6);
    });
  });

  describe("multiple lines", () => {
    it("wraps each line independently", () => {
      const result = wrapText("hello world\nfoo bar baz", 2, 0, 10);
      expect(result.textLines).toEqual(["hello ", "world", "foo bar ", "baz"]);
      expect(result.rowIncrementCount).toBe(3);
    });

    it("handles already broken lines that fit", () => {
      const result = wrapText("hello\nworld", 2, 0, 80);
      expect(result.textLines).toEqual(["hello", "world"]);
      expect(result.rowIncrementCount).toBe(1);
    });

    it("handles text with only newlines", () => {
      const result = wrapText("\n\n", 2, 0, 80);
      expect(result.textLines).toEqual(["", "", ""]);
      expect(result.rowIncrementCount).toBe(2);
      expect(result.newColumn).toBe(0);
    });

    it("handles text starting with newline", () => {
      const result = wrapText("\nhello", 2, 0, 80);
      expect(result.textLines).toEqual(["", "hello"]);
      expect(result.rowIncrementCount).toBe(1);
      expect(result.newColumn).toBe(5);
    });
  });

  describe("panel offset", () => {
    it("respects leftMargin for subsequent lines", () => {
      const result = wrapText("hello world foo bar", 2, 0, 10);
      expect(result.textLines).toEqual(["hello ", "world ", "foo bar"]);
      expect(result.rowIncrementCount).toBe(2);
    });

    it("handles long text with multiple wraps per line", () => {
      const result = wrapText("hello world foo bar baz qux", 2, 0, 10);
      expect(result.rowIncrementCount).toBeGreaterThan(2);
    });
  });

  describe("edge cases", () => {
    it("handles very long word with no breakable chars", () => {
      const result = wrapText("abcdefghij", 2, 0, 10);
      expect(result.textLines).toEqual(["abcdefghij"]);
      expect(result.rowIncrementCount).toBe(0);
    });

    it("handles word longer than available width", () => {
      // startCursor=0, availableWidth = 10 - 0 = 10
      // "abcdefghijk" has width 11 > 10, break at 10
      const result = wrapText("abcdefghijk", 2, 0, 10);
      expect(result.textLines).toEqual(["abcdefghij", "k"]);
      expect(result.rowIncrementCount).toBe(1);
    });

    it("handles tab as breakable whitespace", () => {
      const result = wrapText("hello\tworld", 2, 0, 20);
      expect(result.textLines).toEqual(["hello\tworld"]);
      expect(result.rowIncrementCount).toBe(0);
    });
  });

  describe("ANSI escape sequence handling", () => {
    it("skips ANSI codes at start of line when measuring width", () => {
      const result = wrapText(`${ANSI_STYLE.fg.red}hello`, 2, 0, 80);
      expect(result.textLines).toEqual([`${ANSI_STYLE.fg.red}hello`]);
      expect(result.rowIncrementCount).toBe(0);
      expect(result.newColumn).toBe(5);
    });

    it("skips ANSI codes in the middle of text", () => {
      // he[]y[]world
      const result = wrapText("he\x1b[31my\x1b[0mworld", 2, 0, 80);
      expect(result.textLines).toEqual(["he\x1b[31my\x1b[0mworld"]);
      expect(result.rowIncrementCount).toBe(0);
      expect(result.newColumn).toBe(8);
    });

    it("skips ANSI codes at end of line", () => {
      const result = wrapText("hello\x1b[31m\x1b[0m", 2, 0, 80);
      expect(result.textLines).toEqual(["hello\x1b[31m\x1b[0m"]);
      expect(result.rowIncrementCount).toBe(0);
      expect(result.newColumn).toBe(5);
    });

    it("wraps correctly with ANSI codes embedded", () => {
      // "hello" (5) + space (1) = 6 visual width, ANSI doesn't add width
      const result = wrapText("hello\x1b[31m world", 2, 0, 8);
      expect(result.textLines).toEqual(["hello\x1b[31m ", "world"]);
      expect(result.rowIncrementCount).toBe(1);
      expect(result.newColumn).toBe(5);
    });

    it("handles multiple ANSI sequences in one line", () => {
      // visual width = "hello world" = 11
      const result = wrapText("hello\x1b[31m \x1b[32mworld", 2, 0, 10);
      expect(result.textLines).toEqual(["hello\x1b[31m ", "\x1b[32mworld"]);
      expect(result.rowIncrementCount).toBe(1);
      expect(result.newColumn).toBe(5);
    });

    it("wraps long word with ANSI codes embedded", () => {
      // "hello\x1b[31mworld\x1b[0m" visual = "helloworld" = 10
      // at width 8, should break at visual position 8
      const text = "hello\x1b[31mworld\x1b[0m";
      const result = wrapText(text, 2, 0, 8);

      expect(result.textLines).toEqual(["hello\x1b[31mwor", "ld\x1b[0m"]);
      expect(result.rowIncrementCount).toBe(1);
      expect(result.newColumn).toBe(2);
    });

    it("handles empty visual content with only ANSI codes", () => {
      const result = wrapText("\x1b[31m\x1b[0m", 2, 0, 80);
      expect(result.textLines).toEqual(["\x1b[31m\x1b[0m"]);
      expect(result.rowIncrementCount).toBe(0);
      expect(result.newColumn).toBe(0);
    });

    it("ANSI codes don't affect break point selection", () => {
      // "hello\x1b[31m \x1b[0mworld" - space after ANSI should be break point
      const result = wrapText("hello\x1b[31m \x1b[0mworld", 2, 0, 8);
      expect(result.textLines).toEqual(["hello\x1b[31m ", "\x1b[0mworld"]);
      expect(result.rowIncrementCount).toBe(1);
      expect(result.newColumn).toBe(5);
    });

    it("handles multi-line text with ANSI codes", () => {
      const result = wrapText("hello\x1b[31m world\nfoo\x1b[32m bar", 0, 0, 10);
      logFile(result.textLines)
      expect(result.textLines).toEqual([
        "hello\x1b[31m ",
        "world",
        "foo\x1b[32m bar",
      ]);
      expect(result.rowIncrementCount).toBe(2);
    });

    it("handles ANSI code that spans a wrap boundary", () => {
      // Opening ANSI before wrap, closing after
      const result = wrapText("hello\x1b[31m world", 0, 0, 6);
      expect(result.textLines).toEqual(["hello\x1b[31m ", "world"]);
      expect(result.rowIncrementCount).toBe(1);
      expect(result.newColumn).toBe(5);
    });

    it("handles complex ANSI sequences with multiple parameters", () => {
      const result = wrapText("hello\x1b[1;31;43mworld\x1b[0m", 0, 0, 10);
      expect(result.textLines).toEqual(["hello\x1b[1;31;43mworld\x1b[0m"]);
      expect(result.rowIncrementCount).toBe(0);
      expect(result.newColumn).toBe(10);
    });

    it("wraps at exact visual width boundary with ANSI codes", () => {
      // "hello\x1b[31m" visual = 5, fits exactly at width 5
      const result = wrapText("hello\x1b[31m", 0, 0, 5);
      expect(result.textLines).toEqual(["hello\x1b[31m"]);
      expect(result.rowIncrementCount).toBe(0);
      expect(result.newColumn).toBe(5);
    });

    it("handles consecutive ANSI codes without text between them", () => {
      const result = wrapText("\x1b[31m\x1b[1m\x1b[4mhello", 0, 0, 80);
      expect(result.textLines).toEqual(["\x1b[31m\x1b[1m\x1b[4mhello"]);
      expect(result.rowIncrementCount).toBe(0);
      expect(result.newColumn).toBe(5);
    });

    it("handles ANSI code immediately followed by wrap boundary", () => {
      // "hello\x1b[31m" visual = 5, "world" = 5, total visual = 10
      // at width 5, "hello\x1b[31m" fits, "world" wraps
      const result = wrapText("hello\x1b[31mworld", 0, 0, 5);
      logFile(result.textLines);
      expect(result.textLines).toEqual(["hello", "\x1b[31mworld"]);
      expect(result.rowIncrementCount).toBe(1);
      expect(result.newColumn).toBe(5);
    });
  });
});
