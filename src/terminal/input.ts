import { ANSI } from "./ansi";
import { wrapText } from "./wrap";

export interface InputManagerProps {
  onUserInputUpdate: (input: string, render: string) => void;
  onSubmit: (input: string) => void; // on submit contains the entire buffer anyways to cover if your user is apm freak
  onTerminate: () => void;
  onTab?: () => void;
  onInterrupt?: () => void;
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
  pushHistory: (text: string) => void;
  clearHistory: () => void;
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
  const { onUserInputUpdate, onSubmit, onTerminate, onTab, onInterrupt } = props;
  let buffer = "";
  let cursor = 0;
  let escapeSequence = "";
  let isStarted = false;
  let isInputSupressed = false;
  let bareEscTimeout: ReturnType<typeof setTimeout> | null = null;

  let cursorInterval: NodeJS.Timeout;
  let isCursorBlinkVisible = true;

  let exitTimeout: ReturnType<typeof setTimeout> | null = null;

  let history: string[] = [];
  let historyIndex = -1;
  let draftBuffer: string | null = null;
  let draftCursor = 0;

  const getWrapWidth = (): number => {
    const cols = process.stdout.columns || 80;
    return Math.max(1, cols - 4);
  };

  const computeVisualLayout = () => {
    const wrapWidth = getWrapWidth();
    const lines = buffer.split("\n");
    const visualLines: Array<{ text: string; graphemeCount: number; lineOffset: number }> = [];
    let cumulativeGraphemes = 0;

    for (const line of lines) {
      const wrapped = wrapText(line, 1, wrapWidth);
      for (const wLine of wrapped.textLines) {
        const gCount = countGraphemes(wLine);
        visualLines.push({
          text: wLine,
          graphemeCount: gCount,
          lineOffset: cumulativeGraphemes,
        });
        cumulativeGraphemes += gCount;
      }
      cumulativeGraphemes++;
    }

    return { visualLines, wrapWidth };
  };

  const getVisualPosition = () => {
    const { visualLines } = computeVisualLayout();
    if (visualLines.length === 0) return { visualLine: 0, visualCol: 0 };

    for (let i = 0; i < visualLines.length; i++) {
      const vl = visualLines[i];
      if (vl && cursor >= vl.lineOffset && cursor <= vl.lineOffset + vl.graphemeCount) {
        return { visualLine: i, visualCol: cursor - vl.lineOffset };
      }
    }

    const last = visualLines[visualLines.length - 1];
    if (!last) return { visualLine: 0, visualCol: 0 };
    return {
      visualLine: visualLines.length - 1,
      visualCol: Math.min(cursor - last.lineOffset, last.graphemeCount),
    };
  };

  const setCursorFromVisual = (targetVisualLine: number, targetVisualCol: number) => {
    const { visualLines } = computeVisualLayout();
    if (targetVisualLine < 0 || targetVisualLine >= visualLines.length) return;
    const vl = visualLines[targetVisualLine];
    if (!vl) return;
    const clampedCol = Math.max(0, Math.min(targetVisualCol, vl.graphemeCount));
    cursor = vl.lineOffset + clampedCol;
  };

  const moveCursorUpLine = (): boolean => {
    const { visualLines } = computeVisualLayout();
    if (visualLines.length <= 1) return false;

    const pos = getVisualPosition();

    if (pos.visualLine === 0) return false;

    const targetLine = pos.visualLine - 1;
    const vl = visualLines[targetLine];
    if (!vl) return false;
    const clampedCol = Math.min(pos.visualCol, vl.graphemeCount);
    setCursorFromVisual(targetLine, clampedCol);
    handleUpdateUserInput();
    return true;
  };

  const moveCursorDownLine = (): boolean => {
    const { visualLines } = computeVisualLayout();
    if (visualLines.length <= 1) return false;

    const pos = getVisualPosition();

    if (pos.visualLine >= visualLines.length - 1) return false;

    const targetLine = pos.visualLine + 1;
    const vl = visualLines[targetLine];
    if (!vl) return false;
    const clampedCol = Math.min(pos.visualCol, vl.graphemeCount);
    setCursorFromVisual(targetLine, clampedCol);
    handleUpdateUserInput();
    return true;
  };

  const navigateHistoryUp = (): void => {
    if (history.length === 0) return;

    if (historyIndex === -1) {
      draftBuffer = buffer;
      draftCursor = cursor;
    }

    if (historyIndex === -1) {
      historyIndex = history.length - 1;
    } else if (historyIndex > 0) {
      historyIndex--;
    }

    const entry = history[historyIndex];
    if (!entry) return;
    buffer = entry;
    cursor = countGraphemes(buffer);
    handleUpdateUserInput();
  };

  const navigateHistoryDown = (): void => {
    if (historyIndex === -1) return;

    if (historyIndex >= history.length - 1) {
      buffer = draftBuffer ?? "";
      cursor = draftCursor;
      historyIndex = -1;
      draftBuffer = null;
      draftCursor = 0;
      handleUpdateUserInput();
    } else {
      historyIndex++;
      const entry = history[historyIndex];
      if (!entry) return;
      buffer = entry;
      cursor = countGraphemes(buffer);
      handleUpdateUserInput();
    }
  };

  const resetHistoryNav = (): void => {
    historyIndex = -1;
    draftBuffer = null;
    draftCursor = 0;
  };

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
    if (bareEscTimeout !== null) {
      clearTimeout(bareEscTimeout);
      bareEscTimeout = null;
    }
    escapeSequence += char;

    if (escapeSequence === "\x1b[A") {
      if (!moveCursorUpLine()) {
        navigateHistoryUp();
      }
      escapeSequence = "";
      return;
    }

    if (escapeSequence === "\x1b[B") {
      if (!moveCursorDownLine()) {
        navigateHistoryDown();
      }
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

    if (escapeSequence === "\x1b[20~") {
      clearExitTimeout();
      resetHistoryNav();
      insertChar("\n");
      handleUpdateUserInput();
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
        resetHistoryNav();
        deleteCharForward();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\r") {
        clearExitTimeout();
        onSubmit(buffer);
        onUserInputUpdate("", "");
        wipeBuffer();
        return;
      }

      if (char === "\n") {
        clearExitTimeout();
        resetHistoryNav();
        insertChar("\n");
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x08") {
        // Ctrl+Backspace: delete word before cursor
        clearExitTimeout();
        resetHistoryNav();
        deleteWord();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x7f") {
        // Regular Backspace: delete char before cursor
        resetHistoryNav();
        deleteBeforeCursor();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x15") {
        // ctrl + U : supposed to
        // typically deletes everything from the current cursor position back to the beginning of the line (kill line).
        // TODO
        clearExitTimeout();
        resetHistoryNav();
        wipeBuffer();
        handleUpdateUserInput();
        continue;
      }

      if (char === "\x17") {
        //  || char === "\x1f"
        // ctrl + w ||
        clearExitTimeout();
        resetHistoryNav();
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
        // Could be bare ESC (interrupt) or start of arrow key sequence
        bareEscTimeout = setTimeout(() => {
          bareEscTimeout = null;
          escapeSequence = "";
          onInterrupt?.();
        }, 50);
        escapeSequence = char;
        continue;
      }

      if (char === "\x09") {
        // tab
        clearExitTimeout();
        onTab?.();
        continue;
      }

      if (char[0] != null && char[0] >= " ") {
        clearExitTimeout();
        resetHistoryNav();
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
      if (bareEscTimeout) {
        clearTimeout(bareEscTimeout);
        bareEscTimeout = null;
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

    pushHistory: (text: string): void => {
      if (!text.trim()) return;
      history.push(text);
      historyIndex = -1;
      draftBuffer = null;
      draftCursor = 0;
    },

    clearHistory: (): void => {
      history = [];
      historyIndex = -1;
      draftBuffer = null;
      draftCursor = 0;
    },
  };
};
