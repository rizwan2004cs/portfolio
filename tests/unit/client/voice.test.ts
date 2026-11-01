// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mountVoice } from "@/client/voice";

/** A stand-in for the browser's SpeechRecognition: records calls, and lets a test deliver a transcript. */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = ""; interimResults = true; maxAlternatives = 0; started = 0; stopped = 0;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null;
  onend: (() => void) | null = null; onerror: ((e?: { error?: string }) => void) | null = null;
  fail(error: string) { this.onerror?.({ error }); this.onend?.(); }
  constructor() { FakeRecognition.last = this; }
  start() { this.started++; }
  stop() { this.stopped++; }
  hear(text: string) { this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })] }); this.onend?.(); }
  partial(text: string) { this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: false })] }); }
}

describe("voice input", () => {
  const setup = (api: boolean) => {
    document.body.innerHTML = '<form id="form"><input id="inp"><button type="button" id="mic" hidden></button></form>';
    const w = window as unknown as Record<string, unknown>;
    if (api) w.SpeechRecognition = FakeRecognition; else { delete w.SpeechRecognition; delete w.webkitSpeechRecognition; }
    const button = document.querySelector<HTMLButtonElement>("#mic")!, input = document.querySelector<HTMLInputElement>("#inp")!;
    const sent: string[] = [];
    return { button, input, sent, voice: mountVoice(button, input, (t) => sent.push(t)) };
  };
  it("stays hidden where the browser cannot listen", () => {
    const { button, voice } = setup(false);
    expect(button.hidden).toBe(true); expect(voice.spoke()).toBe(false);
  });
  it("a tap listens; what is heard is sent down the same path as typed text; a second tap stops", () => {
    const { button, input, sent, voice } = setup(true);
    expect(button.hidden).toBe(false);
    button.click();
    expect(FakeRecognition.last!.started).toBe(1); expect(FakeRecognition.last!.interimResults).toBe(false); expect(button.getAttribute("aria-pressed")).toBe("true"); expect(input.placeholder).toBe("Listening…");
    FakeRecognition.last!.hear("  show me PACK ");
    expect(sent).toEqual(["show me PACK"]); expect(voice.spoke()).toBe(true); expect(button.getAttribute("aria-pressed")).toBe("false");
    button.click(); button.click();
    expect(FakeRecognition.last!.stopped).toBe(1);
  });
  it("reads a reply aloud once after a spoken question, never after typing", () => {
    const { button, voice } = setup(true);
    const speak = vi.fn(), cancel = vi.fn();
    Object.defineProperty(window, "speechSynthesis", { value: { speak, cancel }, configurable: true });
    (globalThis as unknown as Record<string, unknown>).SpeechSynthesisUtterance = class { text: string; lang = ""; constructor(t: string) { this.text = t; } };
    voice.say("Here is PACK."); expect(speak).not.toHaveBeenCalled(); // typed: quiet
    button.click(); FakeRecognition.last!.hear("show me PACK");
    voice.say("Here is PACK."); expect(speak).toHaveBeenCalledTimes(1); expect((speak.mock.calls[0][0] as { text: string }).text).toBe("Here is PACK.");
    voice.say("And more."); expect(speak).toHaveBeenCalledTimes(1); // one reply per spoken question
  });
});

describe("voice input failures", () => {
  it("a blocked microphone says so in the input instead of resetting silently", () => {
    document.body.innerHTML = '<form id="form"><input id="inp"><button type="button" id="mic" hidden></button></form>';
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    const button = document.querySelector<HTMLButtonElement>("#mic")!, input = document.querySelector<HTMLInputElement>("#inp")!;
    mountVoice(button, input, () => {});
    button.click(); FakeRecognition.last!.fail("not-allowed");
    expect(button.getAttribute("aria-pressed")).toBe("false"); expect(input.placeholder).toMatch(/^Microphone blocked for this site/);
    button.click(); FakeRecognition.last!.fail("no-speech");
    expect(input.placeholder).toMatch(/^Didn’t catch that/);
  });
});

describe("only the final result is sent, once", () => {
  it("ignores an early partial result and a repeated final one", () => {
    document.body.innerHTML = '<form id="form"><input id="inp"><button type="button" id="mic" hidden></button></form>';
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    const sent: string[] = [];
    mountVoice(document.querySelector<HTMLButtonElement>("#mic")!, document.querySelector<HTMLInputElement>("#inp")!, (t) => sent.push(t));
    document.querySelector<HTMLButtonElement>("#mic")!.click();
    FakeRecognition.last!.partial("Show");
    expect(sent).toEqual([]);
    FakeRecognition.last!.onresult?.({ results: [Object.assign([{ transcript: "Show" }], { isFinal: true }), Object.assign([{ transcript: "Show me PACK" }], { isFinal: true })] });
    FakeRecognition.last!.onresult?.({ results: [Object.assign([{ transcript: "Show me PACK" }], { isFinal: true })] });
    FakeRecognition.last!.onend?.();
    expect(sent).toEqual(["Show me PACK"]);
  });
});
