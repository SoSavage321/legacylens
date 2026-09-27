import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { WorkflowId } from "../types/pack";
import type { Screen } from "../lib/router";
import { useProgress } from "../lib/progress";
import { ask, suggestionsFor, type BobAction, type BobAnswer, type BobContext } from "../lib/bob";
import { SHORT_COMMIT, confidenceOf, isVerified } from "../lib/evidence";
import {
  loadVoicePref,
  saveVoicePref,
  speak,
  speechSupported,
  stopSpeaking,
  useDictation,
  useSpeaking,
} from "../lib/voice";
import { useEvidence } from "./Evidence";
import { ConfidenceBadge } from "./ui";
import { IconArrowRight, IconClose, IconEvidence } from "./Icons";

// ---------------------------------------------------------------------------
// BobOrb — Bob's face. State drives the animation.
// ---------------------------------------------------------------------------

export type OrbState = "idle" | "thinking" | "speaking" | "listening";

export function BobOrb({ state = "idle", size = 40 }: { state?: OrbState; size?: number }) {
  return (
    <span className={`bob-orb bob-orb--${state}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="bob-orb-core" />
      <span className="bob-orb-ring" />
      <span className="bob-orb-eyes">
        <i />
        <i />
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Voice-only icons (kept local — only Bob uses them)
// ---------------------------------------------------------------------------

const IconMic = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

const IconSpeaker = ({ size = 16, off }: { size?: number; off?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9h4l5-4v14l-5-4H4z" />
    {off ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
  </svg>
);

const IconSend = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const IconPlay = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
  </svg>
);

export const IconStop = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface Message {
  id: number;
  from: "you" | "bob";
  text: string;
  answer?: BobAnswer;
}

interface BobContextValue {
  isOpen: boolean;
  open: (question?: string) => void;
  close: () => void;
  toggle: () => void;
  voiceOn: boolean;
  setVoiceOn: (on: boolean) => void;
  /** Workflow the developer asked Bob to narrate; the Workflows screen picks it up. */
  tourRequest: WorkflowId | null;
  startTour: (id: WorkflowId) => void;
  clearTour: () => void;
  bobContext: BobContext;
}

const Ctx = createContext<BobContextValue | null>(null);

export function useBob(): BobContextValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBob must be used inside BobProvider");
  return c;
}

export function BobProvider({
  screen,
  navigate,
  children,
}: {
  screen: Screen;
  navigate: (to: string) => void;
  children: ReactNode;
}) {
  const { progress, readiness, current } = useProgress();
  const [isOpen, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [voiceOn, setVoiceState] = useState(loadVoicePref);
  const [tourRequest, setTour] = useState<WorkflowId | null>(null);

  const bobContext = useMemo<BobContext>(
    () => ({ screen, progress, readiness, current }),
    [screen, progress, readiness, current]
  );

  const setVoiceOn = useCallback((on: boolean) => {
    setVoiceState(on);
    saveVoicePref(on);
    if (!on) stopSpeaking();
  }, []);

  const open = useCallback((question?: string) => {
    setOpen(true);
    if (question) setPending(question);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    stopSpeaking();
  }, []);

  const startTour = useCallback(
    (id: WorkflowId) => {
      setTour(id);
      navigate(`workflows/${id}`);
    },
    [navigate]
  );

  // Shareable questions: ?ask=how+does+checkout+work opens Bob with the question answered
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("ask");
    if (q) open(q);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<BobContextValue>(
    () => ({
      isOpen,
      open,
      close,
      toggle: () => setOpen((o) => !o),
      voiceOn,
      setVoiceOn,
      tourRequest,
      startTour,
      clearTour: () => setTour(null),
      bobContext,
    }),
    [isOpen, open, close, voiceOn, setVoiceOn, tourRequest, startTour, bobContext]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <BobLauncher />
      <BobDock navigate={navigate} pending={pending} clearPending={() => setPending(null)} />
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Launcher — floating "Ask Bob" button
// ---------------------------------------------------------------------------

function BobLauncher() {
  const { isOpen, open } = useBob();
  const speaking = useSpeaking();
  if (isOpen) return null;
  return (
    <button className="bob-launcher" onClick={() => open()} aria-label="Ask Bob (Ctrl+J)">
      <BobOrb size={34} state={speaking ? "speaking" : "idle"} />
      <span className="bob-launcher-text">Ask Bob</span>
      <kbd>Ctrl J</kbd>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dock — the conversation panel
// ---------------------------------------------------------------------------

let nextId = 1;

function BobDock({
  navigate,
  pending,
  clearPending,
}: {
  navigate: (to: string) => void;
  pending: string | null;
  clearPending: () => void;
}) {
  const { isOpen, close, voiceOn, setVoiceOn, startTour, bobContext } = useBob();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const speaking = useSpeaking();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ctxRef = useRef(bobContext);
  ctxRef.current = bobContext;
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;

  const submit = useCallback((raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setInput("");
    setMessages((m) => [...m, { id: nextId++, from: "you", text: q }]);
    setThinking(true);
    // A short beat so the answer reads as a reply rather than a flash of text.
    setTimeout(() => {
      const answer = ask(q, ctxRef.current);
      setThinking(false);
      setMessages((m) => [...m, { id: nextId++, from: "bob", text: answer.text, answer }]);
      if (voiceRef.current) speak(answer.text);
    }, 420);
  }, []);

  const dictation = useDictation(submit);

  useEffect(() => {
    if (isOpen && pending) {
      submit(pending);
      clearPending();
    }
  }, [isOpen, pending, submit, clearPending]);

  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      // Let the evidence drawer and palette handle their own Escape first
      if (e.key === "Escape" && !document.querySelector(".drawer-root, .palette-root")) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const runAction = (a: BobAction) => {
    if (a.kind === "route") navigate(a.route);
    else if (a.kind === "tour") {
      startTour(a.workflowId);
      close();
    } else submit(a.question);
  };

  const orbState: OrbState = dictation.listening ? "listening" : thinking ? "thinking" : speaking ? "speaking" : "idle";
  const suggestions = suggestionsFor(bobContext.screen);

  if (!isOpen) return null;

  return (
    <aside className="bob-dock" role="complementary" aria-label="Ask Bob">
      <header className="bob-dock-head">
        <BobOrb size={36} state={orbState} />
        <div className="bob-dock-title">
          <strong>Bob</strong>
          <span>
            {dictation.listening
              ? "Listening…"
              : thinking
                ? "Searching my analysis…"
                : speaking
                  ? "Speaking"
                  : `Grounded in verified source · ${SHORT_COMMIT}`}
          </span>
        </div>
        {speechSupported && (
          <button
            className={`icon-btn bob-voice-toggle ${voiceOn ? "is-on" : ""}`}
            onClick={() => setVoiceOn(!voiceOn)}
            aria-pressed={voiceOn}
            title={voiceOn ? "Bob reads answers aloud — click to mute" : "Let Bob read answers aloud"}
          >
            <IconSpeaker off={!voiceOn} />
          </button>
        )}
        <button className="icon-btn" onClick={close} aria-label="Close Bob">
          <IconClose />
        </button>
      </header>

      <div className="bob-dock-body" ref={listRef} aria-live="polite">
        {messages.length === 0 && (
          <div className="bob-welcome">
            <BobOrb size={64} state={orbState} />
            <h2>Ask me anything about this codebase.</h2>
            <p>
              I analysed every file and cited my sources. Ask how something works, where it lives, or what to do next —
              by typing{dictation.supported ? " or by voice" : ""}.
            </p>
          </div>
        )}
        {messages.map((m) =>
          m.from === "you" ? (
            <div key={m.id} className="bob-msg bob-msg--you">
              {m.text}
            </div>
          ) : (
            <BobReply key={m.id} answer={m.answer!} onAction={runAction} />
          )
        )}
        {thinking && (
          <div className="bob-msg bob-msg--bob bob-typing" aria-label="Bob is thinking">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>

      <footer className="bob-dock-foot">
        {(messages.length === 0 || !thinking) && (
          <div className="bob-chips" aria-label="Suggested questions">
            {(messages.length === 0 ? suggestions : messages[messages.length - 1].answer?.followUps ?? suggestions)
              .slice(0, 3)
              .map((s) => (
                <button key={s} className="bob-chip" onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
          </div>
        )}
        {dictation.error && <p className="bob-mic-error">{dictation.error}</p>}
        <form
          className={`bob-input ${dictation.listening ? "is-listening" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <input
            ref={inputRef}
            value={dictation.listening ? dictation.interim : input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={dictation.listening ? "Listening — ask your question…" : "Ask Bob about the code…"}
            aria-label="Ask Bob a question"
            readOnly={dictation.listening}
          />
          {dictation.supported && (
            <button
              type="button"
              className={`bob-mic ${dictation.listening ? "is-on" : ""}`}
              onClick={dictation.listening ? dictation.stop : dictation.start}
              aria-label={dictation.listening ? "Stop listening" : "Ask by voice"}
              title={dictation.listening ? "Stop listening" : "Ask by voice"}
            >
              <IconMic />
            </button>
          )}
          <button type="submit" className="bob-send" disabled={!input.trim() || dictation.listening} aria-label="Send">
            <IconSend />
          </button>
        </form>
        <p className="bob-disclaimer">
          Bob answers only from his verified analysis — no live model call, nothing invented.
        </p>
      </footer>
    </aside>
  );
}

function BobReply({ answer, onAction }: { answer: BobAnswer; onAction: (a: BobAction) => void }) {
  const { open } = useEvidence();
  const speaking = useSpeaking();
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!speaking) setPlaying(false);
  }, [speaking]);

  return (
    <div className="bob-msg bob-msg--bob">
      <p className="bob-msg-text">{answer.text}</p>

      {answer.items && answer.items.length > 0 && (
        <ul className="bob-findings">
          {answer.items.slice(0, 5).map((it, i) => {
            const verified = it.evidence.filter(isVerified).length;
            const files = [...new Set(it.evidence.map((e) => e.path.replace(/\/$/, "").split("/").pop()))];
            return (
              <li key={i}>
                <button
                  className="bob-finding"
                  onClick={() =>
                    open({ kind: "claim", context: it.title, claim: it.text, basis: it.basis, evidence: it.evidence })
                  }
                >
                  <span className="bob-finding-context">{it.title}</span>
                  <span className="bob-finding-text">{it.text}</span>
                  <span className="bob-finding-foot">
                    <ConfidenceBadge level={confidenceOf(it.basis, it.evidence)} basis={it.basis} citations={verified} compact />
                    <span className="bob-finding-files">
                      <IconEvidence size={12} />
                      {files.slice(0, 2).join(" · ")}
                      {files.length > 2 && ` +${files.length - 2}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="bob-msg-actions">
        {answer.actions?.map((a) => (
          <button key={a.label} className={`bob-action bob-action--${a.kind}`} onClick={() => onAction(a)}>
            {a.kind === "tour" && <IconPlay size={11} />}
            {a.label}
            {a.kind === "route" && <IconArrowRight size={13} />}
          </button>
        ))}
        {speechSupported && (
          <button
            className="bob-replay"
            onClick={() => {
              if (playing) stopSpeaking();
              else {
                speak(answer.text);
                setPlaying(true);
              }
            }}
            aria-label={playing ? "Stop reading" : "Read this answer aloud"}
            title={playing ? "Stop" : "Read aloud"}
          >
            {playing ? <IconStop size={11} /> : <IconSpeaker size={14} />}
          </button>
        )}
      </div>
      {answer.citations > 0 && (
        <span className="bob-grounded">
          ✓ Backed by {answer.citations} citation{answer.citations === 1 ? "" : "s"} · click any finding for the source
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BobTour — Bob narrates a workflow step by step and moves the UI with him
// ---------------------------------------------------------------------------

export function BobTour({
  workflowId,
  name,
  steps,
  order,
  onSelect,
}: {
  workflowId: WorkflowId;
  name: string;
  steps: { order: number; text: string }[];
  order: number;
  onSelect: (order: number) => void;
}) {
  const { tourRequest, clearTour } = useBob();
  const [playing, setPlaying] = useState(false);
  const speaking = useSpeaking();
  // Parents pass inline callbacks; keep the latest in a ref so narration doesn't restart on re-render
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  // Stop when the developer switches workflow or leaves the screen
  useEffect(() => {
    setPlaying(false);
    return () => stopSpeaking();
  }, [workflowId]);

  // Declared after the reset above so a requested tour survives the workflow switch.
  // Tours requested from the Bob panel start automatically once this workflow is showing
  useEffect(() => {
    if (tourRequest !== workflowId) return;
    clearTour();
    selectRef.current(steps[0].order);
    setPlaying(true);
  }, [tourRequest, workflowId, clearTour, steps]);

  useEffect(() => {
    if (!playing) return;
    const idx = steps.findIndex((s) => s.order === order);
    const step = steps[idx];
    if (!step) return;
    const intro = idx === 0 ? `Let's walk through ${name}. ` : "";
    const next = steps[idx + 1];
    speak(`${intro}Step ${step.order}. ${step.text}`, () => {
      if (next) selectRef.current(next.order);
      else {
        setPlaying(false);
        speak(`That's the whole ${name} flow. Mark it traced when you're ready.`);
      }
    });
  }, [playing, order, steps, name]);

  const idx = steps.findIndex((s) => s.order === order);

  return (
    <div className={`bob-tour ${playing ? "is-playing" : ""}`}>
      <BobOrb size={28} state={playing && speaking ? "speaking" : "idle"} />
      <div className="bob-tour-text">
        <strong>{playing ? `Bob is narrating · step ${idx + 1} of ${steps.length}` : "Let Bob walk you through it"}</strong>
        <span>{playing ? "Follow along — the evidence updates as he talks." : speechSupported ? "Narrated, step by step, with the code." : "Auto-advances step by step."}</span>
      </div>
      <button
        className={`btn btn--${playing ? "secondary" : "primary"} btn--sm bob-tour-btn`}
        onClick={() => {
          if (playing) {
            setPlaying(false);
            stopSpeaking();
          } else setPlaying(true);
        }}
      >
        {playing ? <IconStop size={11} /> : <IconPlay size={11} />}
        <span>{playing ? "Stop" : idx > 0 ? "Narrate from here" : "Play walkthrough"}</span>
      </button>
    </div>
  );
}
