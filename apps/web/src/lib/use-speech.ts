"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onspeechstart?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Some phones' speech services never answer or end; give up after this long. */
const WATCHDOG_MS = 15_000;
const SPEAKING_MS = 60_000;
const USE_KEYBOARD = "Voice didn't work here. Tap the mic on your keyboard instead.";
const BLOCKED = "HomeRedo can't use the microphone. Allow it in your phone's settings, or tap the mic on your keyboard.";

function failureMessage(error: string): string | null {
  if (error === "no-speech" || error === "aborted") return null;
  if (error === "not-allowed" || error === "service-not-allowed") return BLOCKED;
  return USE_KEYBOARD;
}

/** Talk instead of typing (where the browser supports it). */
export function useSpeech(onText: (text: string) => void, onFail?: (message: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef({ onText, onFail });
  cb.current = { onText, onFail };

  useEffect(() => setSupported(!!ctor()), []);

  const disarm = useCallback(() => {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
  }, []);

  const finish = useCallback(
    (message: string | null) => {
      disarm();
      const r = rec.current;
      rec.current = null;
      if (r) {
        r.onresult = r.onend = r.onerror = r.onspeechstart = null;
        (r.abort ?? r.stop).call(r);
      }
      setListening(false);
      if (message) cb.current.onFail?.(message);
    },
    [disarm],
  );

  useEffect(() => () => finish(null), [finish]);

  const stop = useCallback(() => finish(null), [finish]);

  const start = useCallback(() => {
    const C = ctor();
    if (!C) return;
    finish(null);
    const r = new C();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) cb.current.onText(text);
    };
    r.onend = () => {
      disarm();
      rec.current = null;
      setListening(false);
    };
    r.onerror = (e) => finish(failureMessage(e.error));
    const arm = (ms: number) => {
      disarm();
      watchdog.current = setTimeout(() => finish(USE_KEYBOARD), ms);
    };
    r.onspeechstart = () => arm(SPEAKING_MS);
    rec.current = r;
    setListening(true);
    arm(WATCHDOG_MS);
    try {
      r.start();
    } catch {
      finish(USE_KEYBOARD);
    }
  }, [disarm, finish]);

  return { supported, listening, start, stop };
}
