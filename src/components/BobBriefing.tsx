import { useEffect, useState } from "react";
import { BOB_TASKS, briefing, suggestionsFor } from "../lib/bob";
import { getPack } from "../lib/pack";
import { SHORT_COMMIT, verificationResolved, verificationTotal } from "../lib/evidence";
import { speak, speechSupported, stopSpeaking, useSpeaking } from "../lib/voice";
import { BobOrb, IconPlay, IconStop, useBob } from "./Bob";
import { IconExternal } from "./Icons";

const pack = getPack();

/** Overview hero: Bob introduces the repository and hands over the next step. */
export function BobBriefing() {
  const { open, bobContext } = useBob();
  const speaking = useSpeaking();
  const [playing, setPlaying] = useState(false);
  const text = briefing(bobContext);

  useEffect(() => {
    if (!speaking) setPlaying(false);
  }, [speaking]);
  useEffect(() => () => stopSpeaking(), []);

  const words = text.split(" ");

  return (
    <section className="bob-brief" aria-labelledby="bob-brief-title">
      <div className="bob-brief-glow" aria-hidden="true" />
      <div className="bob-brief-orb">
        <BobOrb size={88} state={playing ? "speaking" : "idle"} />
      </div>
      <div className="bob-brief-main">
        <div className="eyebrow">
          Briefing from Bob · {pack.overview.repo.name}
        </div>
        <h1 id="bob-brief-title" className="bob-brief-title">
          {bobContext.readiness.totalScore === 0 ? "Hi — I've already read the whole codebase." : "Welcome back. Here's where you are."}
        </h1>
        <p className={`bob-brief-text ${playing ? "is-playing" : ""}`}>
          {words.map((w, i) => (
            <span key={i} style={{ animationDelay: `${i * 18}ms` }}>
              {w}{" "}
            </span>
          ))}
        </p>
        <div className="bob-brief-actions">
          {speechSupported && (
            <button
              className="btn btn--primary btn--md"
              onClick={() => {
                if (playing) stopSpeaking();
                else {
                  speak(text);
                  setPlaying(true);
                }
              }}
            >
              {playing ? <IconStop size={12} /> : <IconPlay size={12} />}
              <span>{playing ? "Stop briefing" : "Play briefing"}</span>
            </button>
          )}
          <button className="btn btn--secondary btn--md" onClick={() => open()}>
            <span>Ask Bob a question</span>
          </button>
          <div className="bob-brief-chips">
            {suggestionsFor("overview").map((q) => (
              <button key={q} className="bob-chip" onClick={() => open(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
        <div className="bob-brief-repo">
          <span className="mono">{pack.overview.repo.name}</span>
          <span>{pack.overview.repo.licence}</span>
          <a href={pack.overview.repo.url} target="_blank" rel="noreferrer" className="source-link">
            {pack.overview.repo.url.replace(/^https?:\/\//, "")} <IconExternal size={12} />
          </a>
          <span className="mono">@ {SHORT_COMMIT}</span>
        </div>
      </div>
    </section>
  );
}

const PHASES = ["Setup", "Analyse", "Verify", "Validate"] as const;

/** How the pack came to exist — Bob's sessions, in order. */
export function BobBuildTimeline() {
  return (
    <section className="ov-section bob-build" aria-labelledby="bob-build-title">
      <div className="section-head">
        <h2 id="bob-build-title" className="section-title">
          How Bob built this onboarding
        </h2>
        <span className="section-hint">
          {BOB_TASKS.length} Bob sessions · {verificationResolved}/{verificationTotal} citations verified
        </span>
      </div>
      <ol className="bob-build-phases">
        {PHASES.map((phase) => (
          <li key={phase} className="bob-build-phase">
            <span className="bob-build-phase-name">{phase}</span>
            <ul>
              {BOB_TASKS.filter((t) => t.phase === phase).map((t) => (
                <li key={t.id} className="bob-build-task">
                  <span className="bob-build-id mono">{t.id}</span>
                  <span className="bob-build-body">
                    <strong>{t.title}</strong>
                    <span>{t.produced}</span>
                    <span className="bob-build-meta mono">
                      {t.mode} · {t.member}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
