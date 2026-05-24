import { logFile } from "../debug-logger";
import {
  ANSI_STYLE,
  clearFromCursor,
  ESC,
  moveTo,
  restoreCursor,
  saveCursor,
} from "../terminal/ansi";
import type { InputManager } from "../terminal/input";
import { wrapText } from "../terminal/wrap";

export type PanelToken = { type: "full-width-rule" };
export type PanelLine = string | PanelToken;
export const FULL_WIDTH_RULE: PanelToken = { type: "full-width-rule" };

export interface OutputBuffer {
  init: (inputManager: InputManager) => Promise<void>;
  setPanel: (lines: PanelLine[]) => void;
  scroll: (text: string) => void;
}

/// you better only create 1 in your entire app, buddy
export const createOutputBuffer = (): OutputBuffer => {
  let scrollBuffer = "";
  let panelLines: PanelLine[] = [];
  let panelHeight = 0;
  let cursorRow = 1;
  let cursorCol = 0;
  let flushScheduled = false;
  let initialized = false;
  let lastResolvedPanel: string[] = [];
  let tabWidth = 8;
  let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let supressPanel: boolean = false;

  const handleResize = async (inputManager: InputManager): Promise<void> => {
    inputManager.supressInput();
    if (!supressPanel) {
      process.stdout.write(`${ESC}[J`);
      supressPanel = true;
    }

    if (resizeDebounceTimer) {
      clearTimeout(resizeDebounceTimer);
    }

    resizeDebounceTimer = setTimeout(async () => {
      try {
        resizeDebounceTimer = null;
        await queryCursorRow();
      } finally {
        inputManager.unsupressInput();
        supressPanel = false;
        scheduleFlush();
      }
    }, 100);
  };

  const queryCursorRow = (): Promise<void> => {
    return new Promise((resolve) => {
      let buffer = "";
      const timeout = setTimeout(() => {
        process.stdin.off("data", onData);
        resolve();
      }, 500);
      const onData = (data: Buffer) => {
        buffer += data.toString();
        const match = buffer.match(/\[(\d+);(\d+)R/);
        if (match) {
          clearTimeout(timeout);
          cursorRow = parseInt(match[1]!, 10);
          process.stdin.off("data", onData);
          resolve();
        }
      };
      process.stdin.on("data", onData);
      process.stdout.write(`${ESC}[6n`);
    });
  };

  const initCursorAndTab = (): Promise<void> => {
    return new Promise((resolve) => {
      let buffer = "";
      const timeout = setTimeout(() => {
        process.stdin.off("data", onData);
        cursorRow = 1;
        tabWidth = 8;
        resolve();
      }, 100);
      const onData = (data: Buffer) => {
        buffer += data.toString();
        const match = buffer.match(/\[(\d+);(\d+)R/);
        if (match) {
          clearTimeout(timeout);
          process.stdin.off("data", onData);
          cursorRow = parseInt(match[1]!, 10);
          tabWidth = parseInt(match[2]!, 10);
          resolve();
        }
      };
      process.stdin.on("data", onData);
      process.stdout.write(`${ESC}7${ESC}[1G\t${ESC}[6n${ESC}8`);
    });
  };

  const arraysEqual = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };

  const scheduleFlush = (): void => {
    if (flushScheduled) return;
    flushScheduled = true;
    setImmediate(() => {
      flushScheduled = false;
      flush();
    });
  };

  const buildPanel = (panelFlush: string[]): string => {
    let out = saveCursor();
    panelFlush.forEach((line, idx) => {
      out += moveTo(cursorRow + idx + 1, 1);
      out += ANSI_STYLE.reset;
      out += line;
    });
    out += restoreCursor();
    return out;
  };

  const sanitizePanelLines = (lines: PanelLine[]): string[] => {
    const cols = process.stdout.columns || 80;

    return lines.map((line) => {
      if (typeof line === "string") {
        // sanitize, make sure the stuff will fit.
        const wraptextResult = wrapText(line, 0, 0, cols);
        return wraptextResult.textLines[0] ?? "";
      }
      if (line.type === "full-width-rule") {
        return "─".repeat(cols);
      }
      return "";
    });
  };

  const flush = (): void => {
    if (!initialized) return;
    const scrollBufferFlush = scrollBuffer;
    scrollBuffer = "";
    const panelFlush = sanitizePanelLines(panelLines);
    const newPanelHeight = Math.max(1, panelFlush.length);
    const totalRows = process.stdout.rows || 24;
    const activeRowLimit = totalRows - newPanelHeight;

    let out = clearFromCursor();

    if (scrollBufferFlush) {
      const cols = process.stdout.columns || 80;
      const wrapTextResult = wrapText(scrollBufferFlush, 0, cursorCol, cols);
      const targetRow = Math.min(
        cursorRow + wrapTextResult.rowIncrementCount,
        activeRowLimit,
      );
      wrapTextResult.textLines.forEach((line, index) => {
        out += line;
        // add a new line for every line not the last one.
        if (index < wrapTextResult.textLines.length - 1) {
          out += "\n";
        }
      });
      cursorRow = targetRow > activeRowLimit ? activeRowLimit : targetRow;
      cursorCol = wrapTextResult.newColumn;

      // at this point cursor should be as accurate as can be
    }

    //here we may need to shift the entire thing up depending on needing space for the panel
    if (cursorRow + newPanelHeight > totalRows) {
      const delta = cursorRow + newPanelHeight - totalRows;
      out += moveTo(totalRows, 1); // limit scroll to right where the scroll ends
      for (let i = 0; i < delta; i++) {
        out += `\n`;
      }
      cursorRow = Math.max(1, cursorRow - delta);

      // since we are setting the row. you have to move ourself back to the right place
      out += moveTo(cursorRow, cursorCol);
    }

    if (!supressPanel) {
      out += buildPanel(panelFlush);
    }

    process.stdout.write(out, "utf-8");
  };

  const init = async (inputManager: InputManager): Promise<void> => {
    inputManager.supressInput();
    await initCursorAndTab();
    initialized = true;
    inputManager.unsupressInput();
    process.on("SIGWINCH", () => {
      // Re-render TUI or update layout here
      return handleResize(inputManager);
    });
  };

  const setPanel = (lines: PanelLine[]): void => {
    const resolved = sanitizePanelLines(lines);
    if (arraysEqual(resolved, lastResolvedPanel)) {
      return;
    }
    lastResolvedPanel = resolved;
    panelLines = lines;
    scheduleFlush();
  };

  const scroll = (text: string): void => {
    if (!text) return;
    scrollBuffer += text;
    scheduleFlush();
  };

  return { init, setPanel, scroll };
};
