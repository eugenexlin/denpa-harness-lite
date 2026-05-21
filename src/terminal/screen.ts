import { moveTo, clearScreen, clearLine, hideCursor, clearFromCursor } from "./ansi";

export interface ScreenManager {
  appendLine: (text: string) => void;
  appendLines: (lines: string[]) => void;
  clearBuffer: () => void;
  setPanel: (lines: string[]) => void;
  getPanelHeight: () => number;
  getInputRow: () => number;
  getInputCol: () => number;
  setInputCol: (col: number) => void;
  scrollUp: () => void;
  scrollDown: () => void;
  scrollToBottom: () => void;
  isAtBottom: () => boolean;
  render: () => void;
  markDirty: () => void;
  onResize: (cb: () => void) => void;
  getRows: () => number;
  getCols: () => number;
  getBufferLength: () => number;
}

export const createScreenManager = (): ScreenManager => {
  const buffer: string[] = [];
  let visibleStart = 0;
  let cursorLine = 0;
  let panelLines: string[] = [];
  let panelHeight = 1;
  let inputCol = 0;
  let autoScroll = true;
  let terminalRows = 24;
  let terminalCols = 80;
  const resizeCallbacks: (() => void)[] = [];
  let dirty = true;

  const updateTerminalSize = (): void => {
    try {
      terminalRows = process.stdout.rows;
      terminalCols = process.stdout.columns;
    } catch {
      terminalRows = 24;
      terminalCols = 80;
    }
  };

  updateTerminalSize();
  process.on("resize", () => {
    updateTerminalSize();
    for (const cb of resizeCallbacks) cb();
  });

  const getVisibleBufferRows = (): number =>
    Math.max(0, terminalRows - panelHeight);

  const clampVisibleStart = (): void => {
    const visibleBufferRows = getVisibleBufferRows();

    if (cursorLine - visibleStart >= visibleBufferRows) {
      visibleStart = cursorLine - visibleBufferRows + 1;
    }

    if (visibleStart < 0) visibleStart = 0;
    if (visibleStart > Math.max(0, buffer.length - visibleBufferRows)) {
      visibleStart = Math.max(0, buffer.length - visibleBufferRows);
    }
  };

  const padLine = (line: string, width: number): string => {
    const ansiMatch = line.match(/\x1b\[[0-9;]*m/g);
    const ansiLen = ansiMatch?.reduce((sum, code) => sum + code.length, 0) ?? 0;
    const textLen = line.length - ansiLen;

    if (textLen >= width) {
      return line.slice(0, width + ansiLen);
    }

    return line + " ".repeat(width - textLen);
  };

  return {
    appendLine: (text: string): void => {
      buffer.push(text);
      cursorLine = buffer.length;
      dirty = true;
    },

    appendLines: (lines: string[]): void => {
      for (const line of lines) {
        buffer.push(line);
      }
      cursorLine = buffer.length;
      dirty = true;
    },

    clearBuffer: (): void => {
      buffer.length = 0;
      cursorLine = 0;
      visibleStart = 0;
      dirty = true;
    },

    setPanel: (lines: string[]): void => {
      panelLines = lines;
      panelHeight = lines.length;
      dirty = true;
    },

    getPanelHeight: (): number => panelHeight,

    getInputRow: (): number => {
      const visibleBufferRows = getVisibleBufferRows();
      return cursorLine - visibleStart;
    },

    getInputCol: (): number => inputCol,

    setInputCol: (col: number): void => {
      inputCol = col;
      dirty = true;
    },

    scrollUp: (): void => {
      if (visibleStart > 0) {
        visibleStart--;
        autoScroll = false;
        dirty = true;
      }
    },

    scrollDown: (): void => {
      const visibleBufferRows = getVisibleBufferRows();
      if (cursorLine - visibleStart < visibleBufferRows - 1) {
        visibleStart++;
        if (cursorLine - visibleStart >= visibleBufferRows - 1) {
          autoScroll = true;
        }
        dirty = true;
      } else {
        autoScroll = true;
        dirty = true;
      }
    },

    scrollToBottom: (): void => {
      autoScroll = true;
      dirty = true;
    },

    isAtBottom: (): boolean => autoScroll,

    render: (): void => {
      if (!dirty && panelLines.length === 0) return;

      clampVisibleStart();

      const visibleBufferRows = getVisibleBufferRows();
      const buf: string[] = [];

      buf.push(clearScreen());

      for (let i = 0; i < visibleBufferRows; i++) {
        const lineIndex = visibleStart + i;
        const line = lineIndex < buffer.length ? (buffer[lineIndex] ?? "") : "";
        const padded = padLine(line, terminalCols);
        if (i < visibleBufferRows - 1) {
          buf.push(padded + "\n");
        } else {
          buf.push(moveTo(0, i) + padded + clearLine());
        }
      }

      for (let i = buffer.length - visibleStart; i < visibleBufferRows; i++) {
        if (i >= 0) {
          buf.push(moveTo(0, i) + clearLine());
        }
      }

      const panelStartRow = visibleBufferRows;
      for (let i = 0; i < panelHeight; i++) {
        const row = panelStartRow + i;
        if (row < terminalRows) {
          const line = i < panelLines.length ? (panelLines[i] ?? "") : "";
          const padded = padLine(line, terminalCols);
          if (row < terminalRows - 1) {
            buf.push(moveTo(0, row) + padded + "\n");
          } else {
            buf.push(moveTo(0, row) + padded + clearLine());
          }
        }
      }

      const cursorRow = panelStartRow;
      const col = Math.min(inputCol, terminalCols - 1);
      buf.push(moveTo(col, cursorRow));
      buf.push(hideCursor());

      process.stdout.write(buf.join(""));
      dirty = false;
    },

    markDirty: (): void => {
      dirty = true;
    },

    onResize: (cb: () => void): void => {
      resizeCallbacks.push(cb);
    },

    getRows: (): number => terminalRows,

    getCols: (): number => terminalCols,

    getBufferLength: (): number => buffer.length,
  };
};
