import { describe, it, expect } from "bun:test";
import { wrapText } from "./wrap";
import { ANSI_REGEX, ANSI_STYLE } from "./ansi";

describe("wrapText", () => {
  describe("basic wrapping", () => {
    it("returns unchanged text when it fits", () => {
      const result = wrapText("hello", 1, 80);
      expect(result.textLines).toEqual(["hello"]);
    });

    it("wraps text at whitespace boundary", () => {
      const result = wrapText("hello world", 1, 10);
      expect(result.textLines).toEqual(["hello ", "world"]);
    });

    it("wraps text at column limit when no whitespace available", () => {
      // startCursor=1, so availableWidth = 10 - 0 = 10
      // "helloxworld" has width 11 > 10, break at 10
      const result = wrapText("helloxworld", 1, 10);
      expect(result.textLines).toEqual(["helloxworl", "d"]);
    });

    it("handles empty text", () => {
      const result = wrapText("", 1, 80);
      expect(result.textLines).toEqual([""]);
    });

    it("handles single character", () => {
      const result = wrapText("a", 1, 80);
      expect(result.textLines).toEqual(["a"]);
    });

    it("handles text that exactly fits", () => {
      const result = wrapText("hello", 1, 7);
      expect(result.textLines).toEqual(["hello"]);
    });
  });

  describe("cursor tracking", () => {
    it("accounts for midstream startCursor when text fits", () => {
      const result = wrapText("hello", 5, 80);
      expect(result.textLines).toEqual(["hello"]);
    });

    it("wraps when startCursor leaves insufficient space", () => {
      // startCursor=75, availableWidth = 80 - 75 = 5
      // "hello" fits (5), " world" continues at leftMargin=2, available=78
      const result = wrapText("hello world", 76, 80);
      expect(result.textLines).toEqual(["hello", " world"]);
    });
  });

  describe("multiple lines", () => {
    it("wraps each line independently", () => {
      const result = wrapText("hello world\nfoo bar baz", 1, 10);
      expect(result.textLines).toEqual(["hello ", "world", "foo bar ", "baz"]);
    });

    it("handles already broken lines that fit", () => {
      const result = wrapText("hello\nworld", 1, 80);
      expect(result.textLines).toEqual(["hello", "world"]);
    });

    it("handles text with only newlines", () => {
      const result = wrapText("\n\n", 1, 80);
      expect(result.textLines).toEqual(["", "", ""]);
    });

    it("handles text starting with newline", () => {
      const result = wrapText("\nhello", 1, 80);
      expect(result.textLines).toEqual(["", "hello"]);
    });
  });

  describe("edge cases", () => {
    it("handles very long word with no breakable chars", () => {
      const result = wrapText("abcdefghij", 1, 10);
      expect(result.textLines).toEqual(["abcdefghij"]);
    });

    it("handles word longer than available width", () => {
      // startCursor=0, availableWidth = 10 - 0 = 10
      // "abcdefghijk" has width 11 > 10, break at 10
      const result = wrapText("abcdefghijk", 1, 10);
      expect(result.textLines).toEqual(["abcdefghij", "k"]);
    });

    it("handles tab as breakable whitespace", () => {
      const result = wrapText("hello\tworld", 1, 20);
      expect(result.textLines).toEqual(["hello\tworld"]);
    });
  });

  describe("ANSI escape sequence handling", () => {
    it("skips ANSI codes at start of line when measuring width", () => {
      const result = wrapText(`${ANSI_STYLE.fg.red}hello`, 1, 80);
      expect(result.textLines).toEqual([`${ANSI_STYLE.fg.red}hello`]);
    });

    it("skips ANSI codes in the middle of text", () => {
      // he[]y[]world
      const result = wrapText("he\x1b[31my\x1b[0mworld", 1, 80);
      expect(result.textLines).toEqual(["he\x1b[31my\x1b[0mworld"]);
    });

    it("skips ANSI codes at end of line", () => {
      const result = wrapText("hello\x1b[31m\x1b[0m", 1, 80);
      expect(result.textLines).toEqual(["hello\x1b[31m\x1b[0m"]);
    });

    it("wraps correctly with ANSI codes embedded", () => {
      // "hello" (5) + space (1) = 6 visual width, ANSI doesn't add width
      const result = wrapText("hello\x1b[31m world", 1, 8);
      expect(result.textLines).toEqual(["hello\x1b[31m ", "world"]);
    });

    it("handles multiple ANSI sequences in one line", () => {
      // visual width = "hello world" = 11
      const result = wrapText("hello\x1b[31m \x1b[32mworld", 1, 10);
      expect(result.textLines).toEqual(["hello\x1b[31m ", "\x1b[32mworld"]);
    });

    it("wraps long word with ANSI codes embedded", () => {
      // "hello\x1b[31mworld\x1b[0m" visual = "helloworld" = 10
      // at width 8, should break at visual position 8
      const text = "hello\x1b[31mworld\x1b[0m";
      const result = wrapText(text, 1, 8);

      expect(result.textLines).toEqual(["hello\x1b[31mwor", "ld\x1b[0m"]);
    });

    it("handles empty visual content with only ANSI codes", () => {
      const result = wrapText("\x1b[31m\x1b[0m", 1, 80);
      expect(result.textLines).toEqual(["\x1b[31m\x1b[0m"]);
    });

    it("ANSI codes don't affect break point selection", () => {
      // "hello\x1b[31m \x1b[0mworld" - space after ANSI should be break point
      const result = wrapText("hello\x1b[31m \x1b[0mworld", 1, 8);
      expect(result.textLines).toEqual(["hello\x1b[31m ", "\x1b[0mworld"]);
    });

    it("handles multi-line text with ANSI codes", () => {
      const result = wrapText("hello\x1b[31m world\nfoo\x1b[32m bar", 1, 10);
      expect(result.textLines).toEqual([
        "hello\x1b[31m ",
        "world",
        "foo\x1b[32m bar",
      ]);
    });

    it("handles ANSI code that spans a wrap boundary", () => {
      // Opening ANSI before wrap, closing after
      const result = wrapText("hello\x1b[31m world", 1, 6);
      expect(result.textLines).toEqual(["hello\x1b[31m ", "world"]);
    });

    it("handles complex ANSI sequences with multiple parameters", () => {
      const result = wrapText("hello\x1b[1;31;43mworld\x1b[0m", 1, 10);
      expect(result.textLines).toEqual(["hello\x1b[1;31;43mworld\x1b[0m"]);
    });

    it("wraps at exact visual width boundary with ANSI codes", () => {
      // "hello\x1b[31m" visual = 5, fits exactly at width 5
      const result = wrapText("hello\x1b[31m", 1, 5);
      expect(result.textLines).toEqual(["hello\x1b[31m"]);
    });

    it("handles consecutive ANSI codes without text between them", () => {
      const result = wrapText("\x1b[31m\x1b[1m\x1b[4mhello", 1, 80);
      expect(result.textLines).toEqual(["\x1b[31m\x1b[1m\x1b[4mhello"]);
    });

    it("handles ANSI code immediately followed by wrap boundary", () => {
      // "hello\x1b[31m" visual = 5, "world" = 5, total visual = 10
      // at width 5, "hello\x1b[31m" fits, "world" wraps
      const result = wrapText("hello\x1b[31mworld", 1, 5);
      expect(result.textLines).toEqual(["hello", "\x1b[31mworld"]);
    });
  });

  describe("unusual characters", () => {
    it("ball lol 🟢", () => {
      const line = "Success 🟢 I'm up.";
      const result = wrapText(line, 1, 10);
      expect(result.textLines).toEqual(["Success ", "🟢 I'm up."]);
    });
    it("ball lol 🟢 sequence", () => {
      const sequence = [
        "Success ",
        "🟢 ",
        "I'm up.",
      ];
      const expectedColumn = [9, 12, 19];
      let col = 1;
      sequence.forEach((line, i) => {
        const wrapResult = wrapText(line, col, 80);
        expectedColumn;
        col = wrapResult.newColumn;
        expect(col).toBe(expectedColumn[i] ?? 0);
      });
    });
  });

  describe("multiple wrapping", () => {
    it("some scenario 1", () => {
      const sequence = [
        "Test received",
        "! I'm up",
        " and running. What",
        " can I help you",
        " with today?",
      ];
      const expectedColumn = [14, 22, 40, 55, 67];
      let col = 1;
      sequence.forEach((line, i) => {
        const wrapResult = wrapText(line, col, 80);
        expectedColumn;
        col = wrapResult.newColumn;
        expect(col).toBe(expectedColumn[i] ?? 0);
      });
    });
  });
});
