import { describe, it, expect } from "bun:test";
import { wrapText } from "./wrap";

describe("wrapText", () => {
  describe("basic wrapping", () => {
    it("returns unchanged text when it fits", () => {
      const result = wrapText("hello", 2, 0, 80);
      expect(result.textLines).toEqual(["hello"]);
      expect(result.rowCount).toBe(1);
      expect(result.newColumn).toBe(5);
    });

    it("wraps text at whitespace boundary", () => {
      const result = wrapText("hello world", 2, 0, 10);
      expect(result.textLines).toEqual(["hello ", "world"]);
      expect(result.rowCount).toBe(2);
      expect(result.newColumn).toBe(5);
    });

    it("wraps text at column limit when no whitespace available", () => {
      // startCursor=0, so availableWidth = 10 - 0 = 10
      // "helloxworld" has width 11 > 10, break at 10
      const result = wrapText("helloxworld", 2, 0, 10);
      expect(result.textLines).toEqual(["helloxworl", "d"]);
      expect(result.rowCount).toBe(2);
      expect(result.newColumn).toBe(1);
    });

    it("handles empty text", () => {
      const result = wrapText("", 2, 0, 80);
      expect(result.textLines).toEqual([""]);
      expect(result.rowCount).toBe(1);
      expect(result.newColumn).toBe(0);
    });

    it("handles single character", () => {
      const result = wrapText("a", 2, 0, 80);
      expect(result.textLines).toEqual(["a"]);
      expect(result.rowCount).toBe(1);
      expect(result.newColumn).toBe(1);
    });

    it("handles text that exactly fits", () => {
      const result = wrapText("hello", 2, 0, 7);
      expect(result.textLines).toEqual(["hello"]);
      expect(result.rowCount).toBe(1);
      expect(result.newColumn).toBe(5);
    });
  });

  describe("cursor tracking", () => {
    it("accounts for midstream startCursor when text fits", () => {
      const result = wrapText("hello", 2, 5, 80);
      expect(result.textLines).toEqual(["hello"]);
      expect(result.rowCount).toBe(1);
      expect(result.newColumn).toBe(5);
    });

    it("wraps when startCursor leaves insufficient space", () => {
      // startCursor=75, availableWidth = 80 - 75 = 5
      // "hello" fits (5), " world" continues at leftMargin=2, available=78
      const result = wrapText("hello world", 2, 75, 80);
      expect(result.textLines).toEqual(["hello", " world"]);
      expect(result.rowCount).toBe(2);
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
      expect(result.rowCount).toBe(4);
    });

    it("handles already broken lines that fit", () => {
      const result = wrapText("hello\nworld", 2, 0, 80);
      expect(result.textLines).toEqual(["hello", "world"]);
      expect(result.rowCount).toBe(2);
    });

    it("handles text with only newlines", () => {
      const result = wrapText("\n\n", 2, 0, 80);
      expect(result.textLines).toEqual(["", "", ""]);
      expect(result.rowCount).toBe(3);
      expect(result.newColumn).toBe(0);
    });

    it("handles text starting with newline", () => {
      const result = wrapText("\nhello", 2, 0, 80);
      expect(result.textLines).toEqual(["", "hello"]);
      expect(result.rowCount).toBe(2);
      expect(result.newColumn).toBe(5);
    });
  });

  describe("panel offset", () => {
    it("respects leftMargin for subsequent lines", () => {
      const result = wrapText("hello world foo bar", 2, 0, 10);
      expect(result.textLines).toEqual(["hello ", "world ", "foo bar"]);
      expect(result.rowCount).toBe(3);
    });

    it("handles long text with multiple wraps per line", () => {
      const result = wrapText("hello world foo bar baz qux", 2, 0, 10);
      expect(result.rowCount).toBeGreaterThan(3);
    });
  });

  describe("edge cases", () => {
    it("handles very long word with no breakable chars", () => {
      const result = wrapText("abcdefghij", 2, 0, 10);
      expect(result.textLines).toEqual(["abcdefghij"]);
      expect(result.rowCount).toBe(1);
    });

    it("handles word longer than available width", () => {
      // startCursor=0, availableWidth = 10 - 0 = 10
      // "abcdefghijk" has width 11 > 10, break at 10
      const result = wrapText("abcdefghijk", 2, 0, 10);
      expect(result.textLines).toEqual(["abcdefghij", "k"]);
      expect(result.rowCount).toBe(2);
    });

    it("handles tab as breakable whitespace", () => {
      const result = wrapText("hello\tworld", 2, 0, 20);
      expect(result.textLines).toEqual(["hello\tworld"]);
      expect(result.rowCount).toBe(1);
    });
  });
});
