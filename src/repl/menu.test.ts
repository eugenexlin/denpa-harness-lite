import { describe, it, expect, afterEach } from "bun:test";
import { createMenu, computeMenuView, type MenuItem } from "./menu";
import { stripAnsi } from "../terminal/ansi";

const items: MenuItem<string>[] = [
  { label: "alpha", value: "a", description: "first" },
  { label: "beta", value: "b" },
  { label: "gamma", value: "c" },
  { label: "delta", value: "d" },
];

const renderedText = (menu: ReturnType<typeof createMenu<string>>): string =>
  menu
    .render()
    .map((l) => (typeof l === "string" ? stripAnsi(l) : ""))
    .join("\n");

let lastMenu: ReturnType<typeof createMenu<string>> | null = null;

afterEach(() => {
  lastMenu?.close();
  lastMenu = null;
});

describe("computeMenuView", () => {
  it("returns all items when there is no filter", () => {
    const view = computeMenuView(items, "", 0, 8);
    expect(view.filtered.length).toBe(4);
    expect(view.selectedIndex).toBe(0);
  });

  it("filters by case-insensitive substring", () => {
    const view = computeMenuView(items, "AL", 0, 8);
    expect(view.filtered.map((i) => i.label)).toEqual(["alpha"]);
  });

  it("clamps the index when the filter shrinks the list", () => {
    const view = computeMenuView(items, "delta", 3, 8);
    expect(view.filtered.length).toBe(1);
    expect(view.selectedIndex).toBe(0);
  });

  it("windows the visible slice around the selection", () => {
    const many: MenuItem<number>[] = Array.from({ length: 20 }, (_, i) => ({
      label: `m${i}`,
      value: i,
    }));
    const view = computeMenuView(many, "", 10, 5);
    expect(view.visible.length).toBe(5);
    expect(view.start).toBe(6);
    expect(view.visible[0]!.label).toBe("m6");
    expect(view.visible[4]!.label).toBe("m10");
  });

  it("returns an empty filtered list when nothing matches", () => {
    const view = computeMenuView(items, "zzz", 0, 8);
    expect(view.filtered.length).toBe(0);
    expect(view.selectedIndex).toBe(0);
  });
});

describe("createMenu render", () => {
  it("renders the title, items, and hint", () => {
    const menu = createMenu<string>({ title: "Pick", items, onSelect: () => {} });
    lastMenu = menu;
    const text = renderedText(menu);
    expect(text).toContain("Pick");
    expect(text).toContain("alpha");
    expect(text).toContain("delta");
    expect(text).toContain("Enter choose");
  });

  it("shows a filter indicator and hides non-matching rows", () => {
    const menu = createMenu<string>({ title: "Pick", items, onSelect: () => {} });
    lastMenu = menu;
    menu.open();
    process.stdin.emit("data", "al");
    const text = renderedText(menu);
    expect(text).toContain("filter:");
    expect(text).toContain("alpha");
    expect(text).not.toContain("delta");
  });
});

describe("createMenu input", () => {
  it("selects the highlighted item on Enter", () => {
    const result: { value: string | null } = { value: null };
    const menu = createMenu<string>({
      title: "Pick",
      items,
      onSelect: (v) => {
        result.value = v;
      },
    });
    lastMenu = menu;
    menu.open();
    process.stdin.emit("data", "\x1b[B");
    process.stdin.emit("data", "\r");
    expect(result.value).toBe("b");
    expect(menu.isOpen()).toBe(false);
  });

  it("wraps navigation at the top", () => {
    const result: { value: string | null } = { value: null };
    const menu = createMenu<string>({
      title: "Pick",
      items,
      initialIndex: 0,
      onSelect: (v) => {
        result.value = v;
      },
    });
    lastMenu = menu;
    menu.open();
    process.stdin.emit("data", "\x1b[A");
    process.stdin.emit("data", "\r");
    expect(result.value).toBe("d");
  });

  it("does not leak arrow-key bytes into the filter", () => {
    const menu = createMenu<string>({ title: "Pick", items, onSelect: () => {} });
    lastMenu = menu;
    menu.open();
    process.stdin.emit("data", "\x1b[B");
    const text = renderedText(menu);
    expect(text).not.toContain("filter:");
  });

  it("cancels on a bare Esc", async () => {
    let cancelled = false;
    const menu = createMenu<string>({
      title: "Pick",
      items,
      onSelect: () => {},
      onCancel: () => {
        cancelled = true;
      },
    });
    lastMenu = menu;
    menu.open();
    process.stdin.emit("data", "\x1b");
    await new Promise((r) => setTimeout(r, 80));
    expect(cancelled).toBe(true);
    expect(menu.isOpen()).toBe(false);
  });
});
