import { useEffect, useRef, useState } from "react";
import { IconLogo } from "../components/Icons";
import { BobOrb } from "../components/Bob";
import { getPack } from "../lib/pack";
import { verificationResolved, verificationTotal } from "../lib/evidence";
import {
  parseGitHubUrl,
  isSupportedRepo,
  SUPPORTED_REPO_SLUG,
  type ParsedRepo,
} from "../lib/repository";

const pack = getPack();

// ---------------------------------------------------------------------------
// Transition steps — only describe operations that actually occur.
// ---------------------------------------------------------------------------

const TRANSITION_STEPS = [
  "Checking repository URL…",
  "Loading Bob's verified onboarding pack…",
  "Checking citations against the analysed commit…",
  "Preparing your onboarding journey…",
] as const;

// Duration each step is visible (ms) — total ≈ 2 s
const STEP_MS = 500;

const STATS = [
  { value: `${verificationResolved}/${verificationTotal}`, label: "citations verified" },
  { value: String(pack.architecture.layers.length), label: "layers mapped" },
  { value: String(pack.workflows.workflows.length), label: "workflows traced" },
  { value: String(pack.quiz.questions.length), label: "knowledge checks" },
  { value: "1", label: "safe first task" },
];

const JOURNEY = [
  { n: "01", title: "Understand", body: "Bob briefs you on the stack, the architecture, and what the README gets wrong." },
  { n: "02", title: "Trace", body: "Bob narrates every critical workflow, hop by hop, with the code on screen." },
  { n: "03", title: "Prove", body: "A short check on the real code. Miss one and Bob points you back to the exact reading step." },
  { n: "04", title: "Change", body: "Your first safe change, with its blast radius and validation commands mapped." },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  onSupported: (repo: ParsedRepo) => void;
  onUnsupported: (repo: ParsedRepo) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RepoEntryScreen({ onSupported, onUnsupported }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const result = parseGitHubUrl(url);
    if (!result.ok) {
      setError(result.error);
      inputRef.current?.focus();
      return;
    }

    const { repo } = result;
    const supported = isSupportedRepo(repo);

    // Begin transition sequence
    setTransitioning(true);
    setStepIndex(0);

    let step = 0;
    const advance = () => {
      step += 1;
      if (step < TRANSITION_STEPS.length) {
        setStepIndex(step);
        setTimeout(advance, STEP_MS);
      } else if (supported) {
        onSupported(repo);
      } else {
        onUnsupported(repo);
      }
    };

    setTimeout(advance, STEP_MS);
  }

  return (
    <div className="landing">
      <div className="landing-aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <header className="landing-nav">
        <span className="landing-brand">
          <IconLogo size={24} />
          LegacyLens
        </span>
        <span className="landing-powered">
          <BobOrb size={16} /> Powered by IBM Bob
        </span>
      </header>

      <main className="landing-main">
        <div className="landing-orb">
          <BobOrb size={112} state={transitioning ? "thinking" : "idle"} />
        </div>

        <h1 className="landing-title">
          Understand any codebase
          <br />
          <span className="landing-grad">in an afternoon, not a month.</span>
        </h1>
        <p className="landing-lede">
          Bob reads the whole repository, proves every claim against the source, and walks you from first look to
          first safe change — by text or by voice.
        </p>

        <form className="landing-form" onSubmit={handleSubmit} aria-label="Repository input">
          <label htmlFor="repo-url" className="sr-only">
            GitHub repository URL
          </label>
          <div className={`landing-search ${error ? "has-error" : ""}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="landing-gh">
              <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
            </svg>
            <input
              id="repo-url"
              ref={inputRef}
              type="url"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder="Paste a GitHub repository URL"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              disabled={transitioning}
              aria-describedby={error ? "repo-url-error" : "repo-url-hint"}
            />
            <button type="submit" className="landing-go" disabled={transitioning || !url.trim()}>
              {transitioning ? "Bob is on it…" : "Onboard me"}
            </button>
          </div>

          {error && (
            <p id="repo-url-error" className="landing-error" role="alert">
              {error}
            </p>
          )}

          {transitioning ? (
            <ol className="landing-steps" role="status" aria-live="polite">
              {TRANSITION_STEPS.map((msg, i) => (
                <li
                  key={msg}
                  className={i < stepIndex ? "is-done" : i === stepIndex ? "is-active" : ""}
                >
                  <span className="landing-step-dot" aria-hidden="true">
                    {i < stepIndex ? "✓" : ""}
                  </span>
                  {msg}
                </li>
              ))}
            </ol>
          ) : (
            <p id="repo-url-hint" className="landing-hint">
              Try the demo Bob has analysed:
              <button
                type="button"
                className="landing-demo"
                onClick={() => {
                  setUrl(`https://github.com/${SUPPORTED_REPO_SLUG}`);
                  setError(null);
                  inputRef.current?.focus();
                }}
              >
                github.com/{SUPPORTED_REPO_SLUG}
              </button>
            </p>
          )}
        </form>

        <ul className="landing-stats" aria-label="What Bob has prepared for the demo repository">
          {STATS.map((s) => (
            <li key={s.label}>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      </main>

      <section className="landing-journey" aria-label="How onboarding works">
        {JOURNEY.map((j) => (
          <article key={j.n} className="landing-card">
            <span className="landing-card-n mono">{j.n}</span>
            <h2>{j.title}</h2>
            <p>{j.body}</p>
          </article>
        ))}
      </section>

      <footer className="landing-foot">
        Every answer is grounded in Bob's analysis, pinned to a commit, and cited to the line. Nothing is invented at
        runtime.
      </footer>
    </div>
  );
}
