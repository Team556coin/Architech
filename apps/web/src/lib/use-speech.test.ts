// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSpeech } from "./use-speech";

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  started = false;
  aborted = false;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.started = true;
  }
  stop() {}
  abort() {
    this.aborted = true;
  }
}

const say = (text: string) => FakeRecognition.last!.onresult!({ results: [Object.assign([{ transcript: text }], { isFinal: true })] });

describe("useSpeech", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  it("hands over what was said", () => {
    const onText = vi.fn();
    const { result } = renderHook(() => useSpeech(onText));
    expect(result.current.supported).toBe(true);
    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    act(() => {
      say("add a patio");
      FakeRecognition.last!.onend!();
    });
    expect(onText).toHaveBeenCalledWith("add a patio");
    expect(result.current.listening).toBe(false);
  });

  it("explains a blocked microphone", () => {
    const onFail = vi.fn();
    const { result } = renderHook(() => useSpeech(vi.fn(), onFail));
    act(() => result.current.start());
    act(() => FakeRecognition.last!.onerror!({ error: "not-allowed" }));
    expect(result.current.listening).toBe(false);
    expect(onFail).toHaveBeenCalledWith(expect.stringMatching(/microphone/i));
  });

  it("stays quiet when nothing was said", () => {
    const onFail = vi.fn();
    const { result } = renderHook(() => useSpeech(vi.fn(), onFail));
    act(() => result.current.start());
    act(() => FakeRecognition.last!.onerror!({ error: "no-speech" }));
    expect(onFail).not.toHaveBeenCalled();
  });

  it("gives up if the phone's speech service never answers", () => {
    const onFail = vi.fn();
    const { result } = renderHook(() => useSpeech(vi.fn(), onFail));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.listening).toBe(false);
    expect(FakeRecognition.last!.aborted).toBe(true);
    expect(onFail).toHaveBeenCalledWith(expect.stringMatching(/keyboard/i));
  });

  it("waits longer once you start talking", () => {
    const onFail = vi.fn();
    const { result } = renderHook(() => useSpeech(vi.fn(), onFail));
    act(() => result.current.start());
    act(() => {
      vi.advanceTimersByTime(5_000);
      (FakeRecognition.last as unknown as { onspeechstart: () => void }).onspeechstart();
      vi.advanceTimersByTime(20_000);
    });
    expect(result.current.listening).toBe(true);
    expect(onFail).not.toHaveBeenCalled();
  });

  it("does not give up while words are still coming in", () => {
    const onFail = vi.fn();
    const { result } = renderHook(() => useSpeech(vi.fn(), onFail));
    act(() => result.current.start());
    act(() => {
      say("a deck");
      FakeRecognition.last!.onend!();
    });
    act(() => vi.advanceTimersByTime(20_000));
    expect(onFail).not.toHaveBeenCalled();
  });

  it("stops right away when you tap stop, even if the service hangs", () => {
    const { result } = renderHook(() => useSpeech(vi.fn()));
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(result.current.listening).toBe(false);
    expect(FakeRecognition.last!.aborted).toBe(true);
  });
});
