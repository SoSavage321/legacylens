import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Speech output — Bob's voice (Web Speech API, runs entirely in the browser)
// ---------------------------------------------------------------------------

export const speechSupported =
  typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

let speaking = false;
/** Bumped on every speak/stop so callbacks from a cancelled utterance are ignored. */
let generation = 0;
const listeners = new Set<() => void>();

function setSpeaking(v: boolean) {
  if (speaking === v) return;
  speaking = v;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSpeaking(): boolean {
  return useSyncExternalStore(subscribe, () => speaking, () => false);
}

// Prefer natural-sounding English voices where the platform has them.
const PREFERRED = [/natural/i, /google us english/i, /aria|jenny|guy/i, /samantha|alex/i, /google uk english/i];

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  for (const re of PREFERRED) {
    const v = voices.find((x) => re.test(x.name));
    if (v) return v;
  }
  return voices.find((v) => v.lang === "en-US") ?? voices[0];
}

if (speechSupported) {
  // Voices load asynchronously in Chromium; touching the list starts the load.
  window.speechSynthesis.getVoices();
}

/** Makes code-flavoured text pleasant to hear: paths become file names, symbols are dropped. */
export function speakable(text: string): string {
  return text
    .replace(/`/g, "")
    .replace(/(?:[\w.@()[\]-]+\/)+([\w.[\]-]+)/g, (_, file: string) => file) // src/lib/checkout.ts → checkout.ts
    .replace(/\.(tsx?|jsx?|mjs|json|mdx?)\b/g, (_, ext: string) => ` dot ${ext}`)
    .replace(/[{}[\]<>|_#*]/g, " ")
    .replace(/=>/g, " to ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chromium stops long utterances after ~15s, so speak sentence-sized chunks back to back. */
function chunk(text: string): string[] {
  const sentences = text.match(/[^.!?;]+[.!?;]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > 180 && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Speaks `text` in Bob's voice. Calls `onDone` when finished naturally (not when
 * interrupted). Without speech support, `onDone` fires after a reading-time delay
 * so narrated tours still advance.
 */
export function speak(text: string, onDone?: () => void): void {
  const gen = ++generation;
  const clean = speakable(text);
  if (!speechSupported) {
    if (onDone) setTimeout(() => gen === generation && onDone(), Math.max(2500, clean.length * 55));
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice();
  const parts = chunk(clean);
  setSpeaking(true);
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    if (voice) u.voice = voice;
    u.rate = 1.03;
    u.pitch = 1;
    if (i === parts.length - 1) {
      u.onend = () => {
        if (gen !== generation) return;
        setSpeaking(false);
        onDone?.();
      };
    }
    u.onerror = () => {
      if (gen === generation) setSpeaking(false);
    };
    synth.speak(u);
  });
}

export function stopSpeaking(): void {
  generation++;
  if (speechSupported) window.speechSynthesis.cancel();
  setSpeaking(false);
}

// ---------------------------------------------------------------------------
// Speech input — ask Bob out loud (Chromium / Safari only; feature-detected)
// ---------------------------------------------------------------------------

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

const RecognitionImpl: RecognitionCtor | undefined =
  typeof window !== "undefined"
    ? ((window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition)
    : undefined;

export const dictationSupported = !!RecognitionImpl;

/** Push-to-talk dictation. `onFinal` receives the full transcript once the speaker pauses. */
export function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  const stop = useCallback(() => recRef.current?.stop(), []);

  const start = useCallback(() => {
    if (!RecognitionImpl) return;
    stopSpeaking(); // don't let Bob hear himself
    recRef.current?.abort();
    const rec = new RecognitionImpl();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else live += r[0].transcript;
      }
      setInterim(finalText + live);
    };
    rec.onerror = (e) => {
      setError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone access was blocked. Allow it in the browser's site settings."
          : e.error === "no-speech"
            ? "I didn't catch that — try again."
            : null
      );
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      recRef.current = null;
      if (finalText.trim()) finalRef.current(finalText.trim());
    };
    recRef.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  }, []);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported: dictationSupported, listening, interim, error, start, stop };
}

// ---------------------------------------------------------------------------
// Preference — whether Bob reads answers aloud
// ---------------------------------------------------------------------------

const VOICE_KEY = "legacylens_bob_voice";

export function loadVoicePref(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) === "on";
  } catch {
    return false;
  }
}

export function saveVoicePref(on: boolean): void {
  try {
    localStorage.setItem(VOICE_KEY, on ? "on" : "off");
  } catch {
    // storage unavailable — preference lasts for this session only
  }
}
