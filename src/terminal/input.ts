import type { ScreenManager } from "./screen";
import { outputBuffer, FULL_WIDTH_RULE } from "../repl/output-buffer";
import { gray } from "./ansi";

export interface InputManager {
  start: () => void;
  stop: () => void;
  submit: () => Promise<string>;
  cancel: () => void;
  getBuffer: () => string;
  getCursor: () => number;
  setCursor: (pos: number) => void;
  wasCancelled: () => boolean;
}

export const createInputManager = (screen: ScreenManager): InputManager => {
  let buffer = "";
  let cursor = 0;
  let escapeSequence = "";
  let resolveFn: ((value: string) => void) | null = null;
  let submitted = false;
  let cancelled = false;
  let rawMode = false;

  const flushPanel = (): void => {
    const panel = [];
    panel.push(FULL_WIDTH_RULE);
    panel.push(`${gray("> ")}${buffer}`);
    panel.push(FULL_WIDTH_RULE);
    outputBuffer.setPanel(panel);
  };

  const insertChar = (char: string): void => {
    buffer = buffer.slice(0, cursor) + char + buffer.slice(cursor);
    cursor++;
    screen.setInputCol(cursor);
  };

  const deleteCharForward = (): void => {
    if (cursor < buffer.length) {
      buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
      screen.setInputCol(cursor);
    }
  };

  const deleteBeforeCursor = (): void => {
    if (cursor > 0) {
      cursor--;
      buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
      screen.setInputCol(cursor);
    }
  };

  const deleteWord = (): void => {
    if (cursor === 0) return;
    let pos = cursor - 1;
    while (pos > 0 && buffer[pos - 1] === " ") pos--;
    while (pos > 0 && buffer[pos - 1] !== " ") pos--;
    buffer = buffer.slice(0, pos) + buffer.slice(cursor);
    cursor = pos;
    screen.setInputCol(cursor);
  };

  const moveCursorLeft = (): void => {
    if (cursor > 0) {
      cursor--;
      screen.setInputCol(cursor);
    }
  };

  const moveCursorRight = (): void => {
    if (cursor < buffer.length) {
      cursor++;
      screen.setInputCol(cursor);
    }
  };

  const moveCursorToStart = (): void => {
    cursor = 0;
    screen.setInputCol(0);
  };

  const moveCursorToEnd = (): void => {
    cursor = buffer.length;
    screen.setInputCol(cursor);
  };

  const handleEscapeSequence = (char: string): void => {
    escapeSequence += char;

    if (escapeSequence === "\x1b[A") {
      moveCursorLeft();
      flushPanel();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[B") {
      moveCursorRight();
      flushPanel();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[C") {
      moveCursorRight();
      flushPanel();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[D") {
      moveCursorLeft();
      flushPanel();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[Z") {
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[3~") {
      deleteCharForward();
      flushPanel();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[1~") {
      moveCursorToStart();
      flushPanel();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[4~") {
      moveCursorToEnd();
      flushPanel();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[5~") {
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[6~") {
      escapeSequence = "";
      return;
    }

    if (escapeSequence.match(/^\x1b\[1[0-2]~$/)) {
      escapeSequence = "";
      return;
    }

    if (escapeSequence.length > 10) {
      escapeSequence = "";
    }
  };

  const handleData = (chunk: Buffer | string): void => {
    const str = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    const chars = str.split("");

    for (const char of chars) {
      if (escapeSequence) {
        handleEscapeSequence(char);
        continue;
      }

      if (char === "\x03") {
        cancelled = true;
        flushPanel();
        if (resolveFn) {
          const fn = resolveFn;
          resolveFn = null;
          fn("");
        }
        return;
      }

      if (char === "\x04") {
        if (buffer.length === 0) {
          cancelled = true;
          flushPanel();
          if (resolveFn) {
            const fn = resolveFn;
            resolveFn = null;
            fn("");
          }
          return;
        }
        deleteCharForward();
        flushPanel();
        continue;
      }

      if (char === "\r" || char === "\n") {
        submitted = true;
        flushPanel();
        if (resolveFn) {
          const fn = resolveFn;
          resolveFn = null;
          fn(buffer);
        }
        return;
      }

      if (char === "\x7f" || char === "\x08") {
        deleteBeforeCursor();
        flushPanel();
        continue;
      }

      if (char === "\x15") {
        buffer = "";
        cursor = 0;
        screen.setInputCol(0);
        flushPanel();
        continue;
      }

      if (char === "\x17") {
        deleteWord();
        flushPanel();
        continue;
      }

      if (char === "\x01") {
        moveCursorToStart();
        flushPanel();
        continue;
      }

      if (char === "\x05") {
        moveCursorToEnd();
        flushPanel();
        continue;
      }

      if (char === "\x1b") {
        escapeSequence = char;
        continue;
      }

      if (char.length === 1 && char >= " ") {
        insertChar(char);
        flushPanel();
      }
    }
  };

  return {
    start: (): void => {
      if (rawMode) return;
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf-8");
      rawMode = true;
      process.stdin.on("data", handleData);
    },

    stop: (): void => {
      if (!rawMode) return;
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.setEncoding("ascii");
      process.stdin.off("data", handleData);
      rawMode = false;
    },

    submit: (): Promise<string> => {
      return new Promise((resolve) => {
        resolveFn = resolve;
        submitted = false;
        cancelled = false;
      });
    },

    cancel: (): void => {
      buffer = "";
      cursor = 0;
      submitted = false;
      cancelled = true;
      screen.setInputCol(0);
      flushPanel();
    },

    getBuffer: (): string => buffer,

    getCursor: (): number => cursor,

    setCursor: (pos: number): void => {
      cursor = Math.max(0, Math.min(pos, buffer.length));
      screen.setInputCol(cursor);
    },

    wasCancelled: (): boolean => cancelled,
  };
};
