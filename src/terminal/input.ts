import { ANSI } from "./ansi";

export interface InputManagerProps {
  onUserInputUpdate: (input: string, render: string) => void;
  onSubmit: (input: string) => void; // on submit contains the entire buffer anyways to cover if your user is apm freak
  onTerminate: () => void;
}

export interface InputManager {
  start: () => void;
  stop: () => void;
  supressInput: () => void;
  unsupressInput: () => void;
  getBuffer: () => string;
  getCursor: () => number;
  setCursor: (pos: number) => void;
  clearExitTimeout: () => void;
}

const segmenter = new Intl.Segmenter();

const graphemeIndexToStringIndex = (
  str: string,
  graphemeIdx: number,
): number => {
  let idx = 0;
  let g = 0;
  for (const seg of segmenter.segment(str)) {
    if (g === graphemeIdx) return idx;
    idx += seg.segment.length;
    g++;
  }
  return str.length;
};

const countGraphemes = (str: string): number => {
  let count = 0;
  for (const _ of segmenter.segment(str)) count++;
  return count;
};

const getGraphemes = (str: string): string[] =>
  [...segmenter.segment(str)].map((s) => s.segment);

export const createInputManager = (props: InputManagerProps): InputManager => {
  const { onUserInputUpdate, onSubmit, onTerminate } = props;
  let buffer = "";
  let cursor = 0;
  let escapeSequence = "";
  let isStarted = false;
  let isInputSupressed = false;

  let cursorInterval: NodeJS.Timeout;
  let isCursorBlinkVisible = true;

  let exitTimeout: ReturnType<typeof setTimeout> | null = null;

  const wipeBuffer = () => {
    buffer = "";
    cursor = 0;
  };

  const clearExitTimeout = (): void => {
    if (exitTimeout !== null) {
      clearTimeout(exitTimeout);
      exitTimeout = null;
    }
  };

  const handleUpdateUserInput = (): void => {
    const strIdx = graphemeIndexToStringIndex(buffer, cursor);
    const beforeCursor = buffer.slice(0, strIdx);
    const graphemes = getGraphemes(buffer);
    const atCursor = graphemes[cursor] || " ";
    const afterCursor = buffer.slice(
      strIdx + (atCursor === " " ? 0 : atCursor.length),
    );
    const formattedInput = isCursorBlinkVisible
      ? beforeCursor +
        ANSI.reverse +
        atCursor +
        ANSI.disable.reverse +
        afterCursor
      : buffer;
    onUserInputUpdate(buffer, formattedInput);
  };

  const insertChar = (char: string): void => {
    const strIdx = graphemeIndexToStringIndex(buffer, cursor);
    buffer = buffer.slice(0, strIdx) + char + buffer.slice(strIdx);
    cursor++;
  };

  const deleteCharForward = (): void => {
    const graphemeLen = countGraphemes(buffer);
    if (cursor < graphemeLen) {
      const strIdx = graphemeIndexToStringIndex(buffer, cursor);
      const nextStrIdx = graphemeIndexToStringIndex(buffer, cursor + 1);
      buffer = buffer.slice(0, strIdx) + buffer.slice(nextStrIdx);
    }
  };

  const deleteBeforeCursor = (): void => {
    if (cursor > 0) {
      cursor--;
      const strIdx = graphemeIndexToStringIndex(buffer, cursor);
      const nextStrIdx = graphemeIndexToStringIndex(buffer, cursor + 1);
      buffer = buffer.slice(0, strIdx) + buffer.slice(nextStrIdx);
    }
  };

  const deleteWord = (): void => {
    if (cursor === 0) return;
    const graphemes = getGraphemes(buffer);
    let pos = cursor - 1;
    while (pos > 0 && graphemes[pos - 1] === " ") pos--;
    while (pos > 0 && graphemes[pos - 1] !== " ") pos--;
    const strPos = graphemeIndexToStringIndex(buffer, pos);
    const strCursor = graphemeIndexToStringIndex(buffer, cursor);
    buffer = buffer.slice(0, strPos) + buffer.slice(strCursor);
    cursor = pos;
  };

  const moveCursorLeft = (): void => {
    if (cursor > 0) {
      cursor--;
    }
  };

  const moveCursorRight = (): void => {
    if (cursor < countGraphemes(buffer)) {
      cursor++;
    }
  };

  const moveCursorToStart = (): void => {
    cursor = 0;
  };

  const moveCursorToEnd = (): void => {
    cursor = countGraphemes(buffer);
  };

  const moveCursorBackwardWord = (): void => {
    if (cursor === 0) return;
    const graphemes = getGraphemes(buffer);
    let pos = cursor - 1;
    while (pos > 0 && graphemes[pos - 1] === " ") pos--;
    while (pos > 0 && graphemes[pos - 1] !== " ") pos--;
    cursor = pos;
  };

  const moveCursorForwardWord = (): void => {
    const graphemeLen = countGraphemes(buffer);
    if (cursor >= graphemeLen) return;
    const graphemes = getGraphemes(buffer);
    let pos = cursor;
    while (pos < graphemeLen && graphemes[pos] === " ") pos++;
    while (pos < graphemeLen && graphemes[pos] !== " ") pos++;
    cursor = pos;
  };

  const handleEscapeSequence = (char: string): void => {
    escapeSequence += char;

    if (escapeSequence === "\x1b[A") {
      moveCursorLeft();
      handleUpdateUserInput();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[B") {
      moveCursorRight();
      handleUpdateUserInput();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[C") {
      moveCursorRight();
      handleUpdateUserInput();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[D") {
      moveCursorLeft();
      handleUpdateUserInput();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[1;5D") {
      moveCursorBackwardWord();
      handleUpdateUserInput();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[1;5C") {
      moveCursorForwardWord();
      handleUpdateUserInput();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[1;5A") {
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[1;5B") {
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[Z") {
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[3~") {
      deleteCharForward();
      handleUpdateUserInput();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[1~") {
      moveCursorToStart();
      handleUpdateUserInput();
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[4~") {
      moveCursorToEnd();
      handleUpdateUserInput();
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

    if (escapeSequence.match(/^\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]$/)) {
      escapeSequence = "";
      return;
    }

    if (escapeSequence.length > 10) {
      escapeSequence = "";
    }
  };

  const handleData = (chunk: Buffer | string): void => {
    if (isInputSupressed) return;
    const str = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    const chars = getGraphemes(str);

    cursorInterval && clearInterval(cursorInterval);
    isCursorBlinkVisible = true;
    cursorInterval = setInterval(() => {
      isCursorBlinkVisible = !isCursorBlinkVisible;
      handleUpdateUserInput();
    }, 500);

    for (const char of chars) {
      if (escapeSequence) {
        handleEscapeSequence(char);
        continue;
      }
      if (char === "\x03") {
        // ctrl + c

        if (exitTimeout !== null) {
          onTerminate();
        }

        if (buffer.length > 0) {
          wipeBuffer();
          handleUpdateUserInput();
        }

        exitTimeout = setTimeout(() => {
          exitTimeout = null;
        }, 1000);

        return;
      }

      if (char === "\x04") {
        if (buffer.length === 0) {
          handleUpdateUserInput();
          return;
        }
        deleteCharForward();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\r" || char === "\n") {
        clearExitTimeout();
        onSubmit(buffer);
        onUserInputUpdate("", "");
        wipeBuffer();
        return;
      }

      if (char === "\x08") {
        // Ctrl+Backspace: delete word before cursor
        clearExitTimeout();
        deleteWord();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x7f") {
        // Regular Backspace: delete char before cursor
        deleteBeforeCursor();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x15") {
        // ctrl + U : supposed to
        // typically deletes everything from the current cursor position back to the beginning of the line (kill line).
        // TODO
        clearExitTimeout();
        wipeBuffer();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x17") {
        //  || char === "\x1f"
        // ctrl + w ||
        clearExitTimeout();
        deleteWord();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x01") {
        // ctrl + a
        moveCursorToStart();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x05") {
        // ctrl + e
        moveCursorToEnd();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x1b") {
        // escape header
        escapeSequence = char;
        continue;
      }

      if (char[0] != null && char[0] >= " ") {
        clearExitTimeout();
        insertChar(char);
        handleUpdateUserInput();
      }
    }
  };

  return {
    start: (): void => {
      if (isStarted) return;
      process.stdin.resume();
      process.stdin.setEncoding("utf-8");
      cursorInterval = setInterval(() => {
        isCursorBlinkVisible = !isCursorBlinkVisible;
        handleUpdateUserInput();
      }, 500);

      isStarted = true;
      process.stdin.on("data", handleData);
    },

    stop: (): void => {
      if (!isStarted) return;
      process.stdin.pause();
      process.stdin.setEncoding("ascii");
      process.stdin.off("data", handleData);
      cursorInterval && clearInterval(cursorInterval);
      if (exitTimeout) {
        clearTimeout(exitTimeout);
        exitTimeout = null;
      }
      isStarted = false;
    },

    supressInput: (): void => {
      isInputSupressed = true;
    },

    unsupressInput: (): void => {
      isInputSupressed = false;
    },

    getBuffer: (): string => buffer,

    getCursor: (): number => cursor,

    setCursor: (pos: number): void => {
      cursor = Math.max(0, Math.min(pos, countGraphemes(buffer)));
    },

    clearExitTimeout: (): void => clearExitTimeout(),
  };
};
