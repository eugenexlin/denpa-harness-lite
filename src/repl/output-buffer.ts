import {
  clearFromCursor,
  ESC,
  restoreCursor,
  saveCursor,
} from "../terminal/ansi";
import type { InputManager } from "../terminal/input";

export type PanelToken = { type: "full-width-rule" };
export type PanelLine = string | PanelToken;
export const FULL_WIDTH_RULE: PanelToken = { type: "full-width-rule" };

export interface OutputBuffer {
  init: (inputManager: InputManager) => Promise<void>;
  setPanel: (lines: PanelLine[]) => void;
  scroll: (text: string) => void;
}

const createOutputBuffer = (): OutputBuffer => {
  let scrollBuffer = "";
  let panelLines: PanelLine[] = [];
  let panelHeight = 0;
  let activeRow = 1;
  let colPos = 0;
  let flushScheduled = false;
  let initialized = false;
  let lastResolvedPanel: string[] = [];
  let tabWidth = 8;

  const handleResize = async (inputManager: InputManager): Promise<void> => {
    inputManager.supressInput();
    process.stdout.write(`${ESC}[J`);
    await queryCursorRow();
    inputManager.unsupressInput();
    scheduleFlush();
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
          activeRow =  parseInt(match[1]!, 10);
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
        activeRow = 1;
        tabWidth = 8;
        resolve();
      }, 100);
      const onData = (data: Buffer) => {
        buffer += data.toString();
        const match = buffer.match(/\[(\d+);(\d+)R/);
        if (match) {
          clearTimeout(timeout);
          process.stdin.off("data", onData);
          activeRow = parseInt(match[1]!, 10);
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

  const countVisualRows = (text: string, cols: number): number => {
    const stripped = text.replace(
      /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g,
      "",
    );
    let rows = 0;
    let col = colPos;
    for (const char of stripped) {
      if (char === "\n") {
        rows++;
        col = 0;
      } else if (char === "\r") {
        col = 0;
      } else {
        col++;
        if (col >= cols) {
          rows++;
          col = 0;
        }
      }
    }
    colPos = col;
    return rows;
  };

  const buildPanel = (panelFlush: string[]): string => {
    let out = saveCursor();
    panelFlush.forEach((line, idx) => {
      out += `${ESC}[${activeRow + idx + 1};1H${ESC}[0m${ESC}[2K${line}`;
    });
    out += restoreCursor();
    return out;
  };

  const resolvePanelLines = (lines: PanelLine[]): string[] => {
    const cols = process.stdout.columns || 80;
    return lines.map((line) => {
      if (typeof line === "string") return line;
      if (line.type === "full-width-rule") return "─".repeat(cols);
      return "";
    });
  };

  const flush = (): void => {
    if (!initialized) return;
    const scrollBufferFlush = scrollBuffer;
    scrollBuffer = "";
    const panelFlush = resolvePanelLines(panelLines);
    const newPanelHeight = Math.max(1, panelFlush.length);
    const totalRows = process.stdout.rows || 24;
    const activeRowLimit = totalRows - newPanelHeight;

    let out = clearFromCursor();

    if (scrollBufferFlush) {
      const cols = process.stdout.columns || 80;
      const newRows = countVisualRows(scrollBufferFlush, cols);
      const targetRow = Math.min(activeRow + newRows, activeRowLimit);
      out += scrollBufferFlush;
      activeRow = targetRow > activeRowLimit ? activeRowLimit : targetRow;
    }

    if (activeRow + newPanelHeight > totalRows) {
      const delta = activeRow + newPanelHeight - totalRows;
      out += `${saveCursor()}${ESC}[1;${Math.max(1, activeRow)}H${ESC}[${activeRow};1H`;
      for (let i = 0; i < delta; i++) out += `\n`;
      out += `${restoreCursor()}`;
      activeRow = Math.max(1, activeRow - delta);
    }

    panelHeight = newPanelHeight;
    const contentBottom = totalRows - panelHeight;
    out += `${ESC}[1;${Math.max(1, contentBottom)}H${ESC}[${activeRow};${colPos + 1}H`;

    out += buildPanel(panelFlush);

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
    const resolved = resolvePanelLines(lines);
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

export const outputBuffer = createOutputBuffer();
