import { useEffect, useRef, useState } from "react";
import { IconLogo } from "../components/Icons";
import {
  parseGitHubUrl,
  isSupportedRepo,
  SUPPORTED_REPO_SLUG,
  type ParsedRepo,
} from "../lib/repository";

// ---------------------------------------------------------------------------
// Transition steps — only describe operations that actually occur.
// ---------------------------------------------------------------------------

const TRANSITION_STEPS = [
  "Checking repository URL…",
  "Loading verified onboarding pack…",
  "Verifying onboarding data…",
  "Preparing your onboarding journey…",
] as const;

// Duration each step is visible (ms) — total ≈ 1.6 s
const STEP_MS = 400;

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
      } else {
        // Transition complete — route to the right view
        if (supported) {
          onSupported(repo);
        } else {
          onUnsupported(repo);
        }
      }
    };

    setTimeout(advance, STEP_MS);
  }

  return (
    <div className="repo-entry">
      <div className="repo-entry-inner">
        {/* Brand */}
        <div className="repo-entry-brand">
          <IconLogo size={32} />
          <span className="repo-entry-brand-name">LegacyLens</span>
        </div>

        {/* Tagline */}
        <p className="repo-entry-tagline">
          Understand an unfamiliar codebase with evidence-backed onboarding.
        </p>

        {/* Form */}
        <form
          className="repo-entry-form"
          onSubmit={handleSubmit}
          aria-label="Repository input"
        >
          <label htmlFor="repo-url" className="repo-entry-label">
            GitHub repository URL
          </label>

          <div className="repo-entry-input-row">
            <input
              id="repo-url"
              ref={inputRef}
              type="url"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              className={`repo-entry-input${error ? " repo-entry-input--error" : ""}`}
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              disabled={transitioning}
              aria-describedby={error ? "repo-url-error" : "repo-url-hint"}
            />
          </div>

          {error && (
            <p id="repo-url-error" className="repo-entry-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn--primary btn--lg repo-entry-cta"
            disabled={transitioning || !url.trim()}
          >
            {transitioning ? (
              <span className="repo-entry-cta-inner">
                <span className="repo-entry-spinner" aria-hidden="true" />
                Analyzing…
              </span>
            ) : (
              "Analyze Repository"
            )}
          </button>
        </form>

        {/* Transition status */}
        {transitioning && (
          <div className="repo-entry-transition" role="status" aria-live="polite">
            {TRANSITION_STEPS.map((msg, i) => (
              <span
                key={msg}
                className={`repo-entry-step${i === stepIndex ? " repo-entry-step--active" : ""}${i < stepIndex ? " repo-entry-step--done" : ""}`}
              >
                {i < stepIndex ? "✓ " : i === stepIndex ? "· " : ""}
                {msg}
              </span>
            ))}
          </div>
        )}

        {/* Demo hint */}
        {!transitioning && (
          <p id="repo-url-hint" className="repo-entry-hint">
            Try the demo:{" "}
            <button
              type="button"
              className="repo-entry-demo-link"
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
      </div>
    </div>
  );
}
