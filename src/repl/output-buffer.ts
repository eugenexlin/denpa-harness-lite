export type PanelToken = { type: "full-width-rule" };
export type PanelLine = string | PanelToken;
export const FULL_WIDTH_RULE: PanelToken = { type: "full-width-rule" };

const ESC = "\x1b";

const queryCursorRow = (): Promise<number> => {
  return new Promise((resolve) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      process.stdin.off("data", onData);
      resolve(1); // Default to row 1 if no response
    }, 500);
    const onData = (data: Buffer) => {
      buffer += data.toString();
      const match = buffer.match(/\[(\d+);(\d+)R/);
      if (match) {
        clearTimeout(timeout);
        const row = parseInt(match[1]!, 10);
        process.stdin.off("data", onData);
        resolve(row);
      }
    };
    process.stdin.on("data", onData);
    process.stdout.write(`${ESC}[6n`); // Request cursor position
  });
};

export class OutputBuffer {
  private scrollBuffer = "";
  private panelLines: PanelLine[] = [];
  private panelHeight = 0;
  private activeRow = 1;
  private colPos = 0;
  private flushScheduled = false;
  private initialized = false;

  async init(): Promise<void> {
    await this.initializeCurrentRow();
    this.initialized = true;
    process.on("resize", () => this.handleResize());
  }

  private handleResize = async (): Promise<void> => {
    process.stdout.write(`${ESC}[J`);
    await new Promise((r) => setTimeout(r, 0));
    await this.initializeCurrentRow();
    this.scheduleFlush();
  };

  async initializeCurrentRow(): Promise<void> {
    const row = await queryCursorRow();
    this.activeRow = row;
  }

  scheduleFlush(): void {
    if (this.flushScheduled) {
      return;
    }
    this.flushScheduled = true;
    setImmediate(() => {
      this.flushScheduled = false;
      this.flush();
    });
  }

  flush(): void {
    if (!this.initialized) {
      return;
    }

    const scrollBufferFlush = this.scrollBuffer;
    this.scrollBuffer = "";
    const panelFlush = this.resolvePanelLines();

    const newPanelHeight = Math.max(1, panelFlush.length);
    const totalRows = process.stdout.rows || 24;
    const activeRowLimit = totalRows - newPanelHeight;

    let out = `${ESC}[J`;

    if (scrollBufferFlush) {
      const cols = process.stdout.columns || 80;
      const newRows = this.countVisualRows(scrollBufferFlush, cols);

      const targetRow = Math.min(this.activeRow + newRows, activeRowLimit);

      out += scrollBufferFlush;

      if (targetRow > activeRowLimit) {
        this.activeRow = activeRowLimit;
      } else {
        this.activeRow = targetRow;
      }
    }

    //height adjust
    if (this.activeRow + newPanelHeight > totalRows) {
      const delta = this.activeRow + newPanelHeight - totalRows;
      out += `${ESC}[7`;
      out += `${ESC}[1;${Math.max(1, this.activeRow)}H`;
      out += `${ESC}[${this.activeRow};1H`;
      for (let i = 0; i < delta; i++) {
        out += `\n`;
      }
      out += `${ESC}[8`;
      this.activeRow = Math.max(1, this.activeRow - delta);
    }

    this.panelHeight = newPanelHeight;
    const contentBottom = totalRows - this.panelHeight;
    out += `${ESC}[1;${Math.max(1, contentBottom)}H`;
    out += `${ESC}[${this.activeRow};${this.colPos + 1}H`;

    out += this.buildPanel(panelFlush);

    process.stdout.write(out, "utf-8");
  }

  private countVisualRows(text: string, cols: number): number {
    const stripped = text.replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, ""); // Remove all ANSI CSI sequences

    let rows = 0;
    let col = this.colPos;
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
    this.colPos = col;
    return rows;
  }

  private buildPanel(panelFlush: string[]): string {
    let out = "";
    out += `${ESC}[7`;
    panelFlush.forEach((line, idx) => {
      out += `${ESC}[${this.activeRow +idx + 1};1H${ESC}[0m${ESC}[2K${line}`;
    });
    out += `${ESC}[8`;
    return out;
  }

  private resolvePanelLines(): string[] {
    const cols = process.stdout.columns || 80;
    return this.panelLines.map((line) => {
      if (typeof line === "string") {
        return line;
      }
      switch (line.type) {
        case "full-width-rule":
          return "─".repeat(cols);
      }
      return "";
    });
  }

  setPanel(lines: PanelLine[]): void {
    this.panelLines = lines;
    this.scheduleFlush();
  }

  scroll(text: string): void {
    if (!text) {
      return;
    }
    this.scrollBuffer += text;
    this.scheduleFlush();
  }
}

export const outputBuffer = new OutputBuffer();
