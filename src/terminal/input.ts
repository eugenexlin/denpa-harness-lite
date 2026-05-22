import { ANSI_STYLE } from "./ansi";

export interface InputManagerProps {
  onUserInputUpdate: (input: string, render: string) => void;
}

export interface InputManager {
  start: () => void;
  stop: () => void;
  supressInput: () => void; // only use for stuff like probing the cursor position in stdout/in
  unsupressInput: () => void;
  submit: () => Promise<string>;
  cancel: () => void;
  getBuffer: () => string;
  getCursor: () => number;
  setCursor: (pos: number) => void;
  wasCancelled: () => boolean;
}

export const createInputManager = (props: InputManagerProps): InputManager => {
  const { onUserInputUpdate } = props;
  let buffer = "";
  let cursor = 0;
  let escapeSequence = "";
  let resolveFn: ((value: string) => void) | null = null;
  let submitted = false;
  let isCancelled = false;
  let isStarted = false;
  let isInputSupressed = false;

  let cursorInterval: NodeJS.Timeout;
  let isCursorBlinkVisible = true;

  const handleUpdateUserInput = (): void => {
    let output = buffer;
    let padOutput = output.padEnd(cursor + 1, " ");
    const formattedInput = isCursorBlinkVisible
      ? padOutput.slice(0, cursor) +
        ANSI_STYLE.reverse +
        padOutput.charAt(cursor) +
        ANSI_STYLE.reset +
        padOutput.slice(cursor + 1)
      : padOutput;
    onUserInputUpdate(output, formattedInput);
  };

  const insertChar = (char: string): void => {
    buffer = buffer.slice(0, cursor) + char + buffer.slice(cursor);
    cursor++;
  };

  const deleteCharForward = (): void => {
    if (cursor < buffer.length) {
      buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
    }
  };

  const deleteBeforeCursor = (): void => {
    if (cursor > 0) {
      cursor--;
      buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
    }
  };

  const deleteWord = (): void => {
    if (cursor === 0) return;
    let pos = cursor - 1;
    while (pos > 0 && buffer[pos - 1] === " ") pos--;
    while (pos > 0 && buffer[pos - 1] !== " ") pos--;
    buffer = buffer.slice(0, pos) + buffer.slice(cursor);
    cursor = pos;
  };

  const moveCursorLeft = (): void => {
    if (cursor > 0) {
      cursor--;
    }
  };

  const moveCursorRight = (): void => {
    if (cursor < buffer.length) {
      cursor++;
    }
  };

  const moveCursorToStart = (): void => {
    cursor = 0;
  };

  const moveCursorToEnd = (): void => {
    cursor = buffer.length;
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

    if (escapeSequence.length > 10) {
      escapeSequence = "";
    }
  };

  const handleData = (chunk: Buffer | string): void => {
    if (isInputSupressed) return;
    const str = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    const chars = str.split("");

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
        isCancelled = true;
        handleUpdateUserInput();
        if (resolveFn) {
          const fn = resolveFn;
          resolveFn = null;
          fn("");
        }
        return;
      }

      if (char === "\x04") {
        if (buffer.length === 0) {
          isCancelled = true;
          handleUpdateUserInput();
          if (resolveFn) {
            const fn = resolveFn;
            resolveFn = null;
            fn("");
          }
          return;
        }
        deleteCharForward();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\r" || char === "\n") {
        submitted = true;
        handleUpdateUserInput();
        if (resolveFn) {
          const fn = resolveFn;
          resolveFn = null;
          fn(buffer);
        }
        return;
      }

      if (char === "\x7f" || char === "\x08") {
        deleteBeforeCursor();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x15") {
        buffer = "";
        cursor = 0;
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x17") {
        deleteWord();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x01") {
        moveCursorToStart();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x05") {
        moveCursorToEnd();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x1b") {
        escapeSequence = char;
        continue;
      }

      if (char.length === 1 && char >= " ") {
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
      cursorInterval;
      isStarted = false;
    },

    supressInput: (): void => {
      isInputSupressed = true;
    },

    unsupressInput: (): void => {
      isInputSupressed = false;
    },

    submit: (): Promise<string> => {
      return new Promise((resolve) => {
        resolveFn = resolve;
        submitted = false;
        isCancelled = false;
      });
    },

    cancel: (): void => {
      buffer = "";
      cursor = 0;
      submitted = false;
      isCancelled = true;
      handleUpdateUserInput();
    },

    getBuffer: (): string => buffer,

    getCursor: (): number => cursor,

    setCursor: (pos: number): void => {
      cursor = Math.max(0, Math.min(pos, buffer.length));
    },

    wasCancelled: (): boolean => isCancelled,
  };
};
