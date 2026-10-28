"use client";

import { useEffect, useState } from "react";

const NO_KEYBOARD = new Set(["checkbox", "radio", "file", "button", "submit", "reset", "range", "color", "image", "hidden"]);

/** Whether focusing this element brings up the on-screen keyboard. */
export function opensKeyboard(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return !NO_KEYBOARD.has(el.type) && !el.readOnly && !el.disabled;
  return el instanceof HTMLElement && (el.isContentEditable === true || el.closest('[contenteditable=""],[contenteditable="true"]') !== null);
}

export type Shortcut = "undo" | "redo" | "peek";

type KeyPress = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

const SPACE_PRESSES = 'button,a[href],select,summary,[role="button"],[role="switch"],[role="checkbox"],[role="radio"],[role="tab"],[role="slider"],[role="option"]';

/** Editor shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, hold Space to peek at the original. */
export function shortcutFor(e: KeyPress, target: Element | null): Shortcut | null {
  if (opensKeyboard(target) || e.altKey) return null;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === "z") return e.shiftKey ? "redo" : "undo";
  if (mod && !e.shiftKey && k === "y") return "redo";
  if (!mod && !e.shiftKey && e.key === " ") return target?.closest(SPACE_PRESSES) ? null : "peek";
  return null;
}

/** True while someone is typing in a field (phones show the keyboard then). */
export function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => setTyping(opensKeyboard(document.activeElement));
    // Hide right away, but wait before showing things again so they don't slide under a tap that is
    // still landing (tapping Send moves focus to the button before the tap finishes).
    const onChange = () => {
      clearTimeout(timer);
      if (opensKeyboard(document.activeElement)) setTyping(true);
      else timer = setTimeout(update, 250);
    };
    document.addEventListener("focusin", onChange);
    document.addEventListener("focusout", onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusin", onChange);
      document.removeEventListener("focusout", onChange);
    };
  }, []);
  return typing;
}
