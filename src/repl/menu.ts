import { ANSI, bgRgb, clearLine } from "../terminal/ansi";
import type { PanelLine } from "./panel";

export interface MenuItem<T> {
  label: string;
  value: T;
  description?: string;
}

export interface MenuOptions<T> {
  title: string;
  items: MenuItem<T>[];
  detail?: string[];
  initialIndex?: number;
  maxVisible?: number;
  hint?: string;
  onSelect: (value: T) => void;
  onCancel?: () => void;
}

export interface Menu<T> {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  render: () => PanelLine[];
}

export interface MenuView<T> {
  filtered: MenuItem<T>[];
  visible: MenuItem<T>[];
  start: number;
  selectedIndex: number;
}

const DEFAULT_MAX_VISIBLE = 8;
const DEFAULT_HINT = "↑/↓ select · type to filter · Enter choose · Esc cancel";

export const computeMenuView = <T>(
  items: MenuItem<T>[],
  filter: string,
  selectedIndex: number,
  maxVisible: number,
): MenuView<T> => {
  const needle = filter.trim().toLowerCase();
  const filtered = needle
    ? items.filter((i) => i.label.toLowerCase().includes(needle))
    : items;
  const clampedIndex =
    filtered.length === 0 ? 0 : Math.min(selectedIndex, filtered.length - 1);
  let start = 0;
  if (clampedIndex >= maxVisible) start = clampedIndex - maxVisible + 1;
  const visible = filtered.slice(start, start + maxVisible);
  return { filtered, visible, start, selectedIndex: clampedIndex };
};

const bgLine = (content: string, rgb: string): string =>
  `${bgRgb(rgb)}${clearLine()}${content}${ANSI.bg.default}`;

export const createMenu = <T>(options: MenuOptions<T>): Menu<T> => {
  const maxVisible = options.maxVisible ?? DEFAULT_MAX_VISIBLE;
  let selectedIndex = options.initialIndex ?? 0;
  let filter = "";
  let isOpen = false;
  let escapeBuffer = "";
  let bareEscTimeout: ReturnType<typeof setTimeout> | null = null;

  const getFiltered = (): MenuItem<T>[] =>
    computeMenuView(options.items, filter, selectedIndex, maxVisible).filtered;

  const move = (delta: number): void => {
    const n = getFiltered().length;
    if (n === 0) return;
    selectedIndex = (selectedIndex + delta + n) % n;
  };

  const handleData = (chunk: Buffer | string): void => {
    if (!isOpen) return;
    const str = typeof chunk === "string" ? chunk : chunk.toString("utf-8");

    for (const char of str) {
      if (escapeBuffer) {
        if (bareEscTimeout !== null) {
          clearTimeout(bareEscTimeout);
          bareEscTimeout = null;
        }
        escapeBuffer += char;
        if (escapeBuffer === "\x1b[A") {
          move(-1);
          escapeBuffer = "";
          continue;
        }
        if (escapeBuffer === "\x1b[B") {
          move(1);
          escapeBuffer = "";
          continue;
        }
        if (/^\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]$/.test(escapeBuffer)) {
          escapeBuffer = "";
          continue;
        }
        if (escapeBuffer.length > 10) escapeBuffer = "";
        continue;
      }

      if (char === "\x1b") {
        if (bareEscTimeout !== null) clearTimeout(bareEscTimeout);
        bareEscTimeout = setTimeout(() => {
          bareEscTimeout = null;
          escapeBuffer = "";
          finish(null);
        }, 50);
        escapeBuffer = char;
        continue;
      }

      if (char === "\r" || char === "\n") {
        const item = getFiltered()[selectedIndex];
        finish(item ? item.value : null);
        return;
      }

      if (char === "\x03") {
        finish(null);
        return;
      }

      if (char === "\x7f") {
        filter = filter.slice(0, -1);
        const n = getFiltered().length;
        if (selectedIndex >= n) selectedIndex = Math.max(0, n - 1);
        continue;
      }

      if (char >= " ") {
        filter += char;
        const n = getFiltered().length;
        if (selectedIndex >= n) selectedIndex = Math.max(0, n - 1);
        continue;
      }
    }
  };

  const close = (): void => {
    if (!isOpen) return;
    isOpen = false;
    process.stdin.off("data", handleData);
    if (bareEscTimeout !== null) {
      clearTimeout(bareEscTimeout);
      bareEscTimeout = null;
    }
    escapeBuffer = "";
  };

  const finish = (value: T | null): void => {
    if (!isOpen) return;
    close();
    if (value !== null) {
      options.onSelect(value);
    } else {
      options.onCancel?.();
    }
  };

  return {
    open: (): void => {
      if (isOpen) return;
      isOpen = true;
      process.stdin.on("data", handleData);
    },

    close,

    isOpen: (): boolean => isOpen,

    render: (): PanelLine[] => {
      const lines: PanelLine[] = [];
      const view = computeMenuView(options.items, filter, selectedIndex, maxVisible);

      lines.push(
        bgLine(
          ` ${ANSI.bold}${ANSI.fg.yellow}${options.title}${ANSI.reset}`,
          ANSI.color.gray900,
        ),
      );

      for (const d of options.detail ?? []) {
        lines.push(bgLine(` ${d}`, ANSI.color.gray900));
      }

      if (filter) {
        lines.push(
          bgLine(
            ` ${ANSI.fg.cyan}filter:${ANSI.reset} ${filter}${ANSI.fg.default}`,
            ANSI.color.gray900,
          ),
        );
      }

      if (view.filtered.length === 0) {
        lines.push(
          bgLine(` ${ANSI.fg.gray}no matches${ANSI.fg.default}`, ANSI.color.gray900),
        );
      } else {
        for (let i = 0; i < view.visible.length; i++) {
          const item = view.visible[i]!;
          const isSel = view.start + i === view.selectedIndex;
          const marker = isSel ? ` ${ANSI.fg.green}❯${ANSI.fg.default} ` : "   ";
          const label = isSel ? `${ANSI.bold}${item.label}${ANSI.disable.bold}` : item.label;
          const desc = item.description
            ? ` ${ANSI.dim}${item.description}${ANSI.disable.dim}`
            : "";
          lines.push(
            bgLine(
              `${marker}${label}${desc}`,
              isSel ? ANSI.color.gray700 : ANSI.color.gray900,
            ),
          );
        }
      }

      lines.push(
        bgLine(` ${ANSI.fg.gray}${options.hint ?? DEFAULT_HINT}${ANSI.fg.default}`, ANSI.color.gray900),
      );

      return lines;
    },
  };
};
