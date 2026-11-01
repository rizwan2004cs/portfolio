/** Voice input through the browser's own speech recognition: the transcript goes down the same path as typed text,
 *  and a reply is read aloud only to a visitor who spoke. Nothing leaves the page that typing would not. */
type Recognition = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e?: { error?: string }) => void) | null };
/** What a silent failure means, said where the visitor is looking: the input's placeholder. */
export const MIC_HINTS: Record<string, string> = {
  "not-allowed": "Microphone blocked for this site: allow it from the icon left of the address bar, then tap the mic again.",
  "service-not-allowed": "Microphone blocked for this site: allow it from the icon left of the address bar, then tap the mic again.",
  "audio-capture": "No microphone found. Type your question instead.",
  "no-speech": "Didn’t catch that. Tap the mic and try again.",
  network: "Speech recognition needs a connection. Type your question instead.",
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function mountVoice(button: HTMLButtonElement | null, input: HTMLInputElement, send: (text: string) => void): { spoke: () => boolean; say: (text: string) => void } {
  const w = window as SpeechWindow, Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  let spoke = false, listening = false, rec: Recognition | null = null;
  if (!button || !Ctor) { if (button) button.hidden = true; return { spoke: () => false, say: () => {} }; }
  button.hidden = false;
  let hintUntil = 0;
  const stop = (hint?: string) => {
    listening = false; button.classList.remove("on"); button.setAttribute("aria-pressed", "false");
    // a failure reason stays visible for a while instead of a silent reset; typing clears it
    if (hint) { input.placeholder = hint; hintUntil = Date.now() + 12_000; setTimeout(() => { if (Date.now() >= hintUntil) input.placeholder = "Ask about Rizwan’s work…"; }, 12_000); }
    else if (Date.now() >= hintUntil) input.placeholder = "Ask about Rizwan’s work…";
  };
  button.onclick = () => {
    if (listening) { rec?.stop(); stop(); return; }
    rec = new Ctor(); rec.lang = document.documentElement.lang || "en-IN"; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => { const t = e.results[0]?.[0]?.transcript?.trim(); if (t) { spoke = true; input.value = ""; send(t); } };
    rec.onend = () => stop(); rec.onerror = (e) => stop(MIC_HINTS[e?.error ?? ""] ?? "Voice input failed. Type your question instead.");
    listening = true; button.classList.add("on"); button.setAttribute("aria-pressed", "true"); input.placeholder = "Listening…";
    try { rec.start(); } catch { stop(); }
  };
  return {
    spoke: () => spoke,
    say: (text) => {
      if (!spoke || !("speechSynthesis" in window) || !text) return;
      spoke = false; // one reply per spoken question: typing afterwards goes quiet again
      try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.slice(0, 600)); u.lang = "en-IN"; window.speechSynthesis.speak(u); } catch { /* no voices */ }
    },
  };
}
