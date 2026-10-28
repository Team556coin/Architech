// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { opensKeyboard, shortcutFor, useTyping } from "./keyboard";

describe("useTyping", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("stays on while a tap moves focus from a field to a button, so the tap still lands", () => {
    const field = document.body.appendChild(document.createElement("textarea"));
    const send = document.body.appendChild(document.createElement("button"));
    const { result } = renderHook(() => useTyping());
    act(() => field.focus());
    expect(result.current).toBe(true);
    act(() => send.focus());
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe(false);
  });
});

const input = (type: string) => Object.assign(document.createElement("input"), { type });

describe("opensKeyboard", () => {
  it("is true for fields you type in", () => {
    for (const t of ["text", "email", "password", "number", "search", "tel", "url"]) expect(opensKeyboard(input(t))).toBe(true);
    expect(opensKeyboard(document.createElement("textarea"))).toBe(true);
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    expect(opensKeyboard(div)).toBe(true);
  });

  it("is false for buttons, checkboxes, file pickers and read-only fields", () => {
    for (const t of ["checkbox", "radio", "file", "button", "range", "color"]) expect(opensKeyboard(input(t))).toBe(false);
    expect(opensKeyboard(document.createElement("button"))).toBe(false);
    const ro = input("text");
    ro.readOnly = true;
    expect(opensKeyboard(ro)).toBe(false);
    expect(opensKeyboard(null)).toBe(false);
  });
});

const key = (k: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>> = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe("shortcutFor", () => {
  const body = () => document.body;

  it("maps Ctrl+Z / Cmd+Z to undo and Shift+Z or Y to redo", () => {
    expect(shortcutFor(key("z", { ctrlKey: true }), body())).toBe("undo");
    expect(shortcutFor(key("z", { metaKey: true }), body())).toBe("undo");
    expect(shortcutFor(key("Z", { ctrlKey: true, shiftKey: true }), body())).toBe("redo");
    expect(shortcutFor(key("y", { ctrlKey: true }), body())).toBe("redo");
  });

  it("maps a plain Space to peek", () => {
    expect(shortcutFor(key(" "), body())).toBe("peek");
    expect(shortcutFor(key(" ", { ctrlKey: true }), body())).toBeNull();
  });

  it("ignores plain letters and Alt combos", () => {
    expect(shortcutFor(key("z"), body())).toBeNull();
    expect(shortcutFor(key("z", { ctrlKey: true, altKey: true }), body())).toBeNull();
  });

  it("leaves typing alone, so Ctrl+Z still undoes text in a field", () => {
    const field = document.createElement("textarea");
    expect(shortcutFor(key("z", { ctrlKey: true }), field)).toBeNull();
    expect(shortcutFor(key(" "), field)).toBeNull();
  });

  it("lets Space press a focused button instead of peeking", () => {
    const button = document.createElement("button");
    const icon = button.appendChild(document.createElement("span"));
    expect(shortcutFor(key(" "), button)).toBeNull();
    expect(shortcutFor(key(" "), icon)).toBeNull();
    const sw = document.createElement("div");
    sw.setAttribute("role", "switch");
    expect(shortcutFor(key(" "), sw)).toBeNull();
    expect(shortcutFor(key("z", { ctrlKey: true }), button)).toBe("undo");
  });
});
