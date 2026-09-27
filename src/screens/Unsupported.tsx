import { IconLogo } from "../components/Icons";
import { SUPPORTED_REPO_SLUG } from "../lib/repository";
import type { ParsedRepo } from "../lib/repository";

interface Props {
  repo: ParsedRepo;
  onTryAnother: () => void;
}

export default function UnsupportedScreen({ repo, onTryAnother }: Props) {
  return (
    <div className="repo-entry">
      <div className="repo-entry-inner repo-entry-inner--wide">
        {/* Brand */}
        <div className="repo-entry-brand">
          <IconLogo size={32} />
          <span className="repo-entry-brand-name">LegacyLens</span>
        </div>

        {/* Status */}
        <div className="unsupported-card">
          <div className="unsupported-icon" aria-hidden="true">⚠</div>
          <h1 className="unsupported-title">Repository analysis unavailable</h1>

          <p className="unsupported-body">
            LegacyLens currently has a verified onboarding pack for:
          </p>

          <div className="unsupported-supported-repo">
            <span className="unsupported-repo-url">
              github.com/{SUPPORTED_REPO_SLUG}
            </span>
          </div>

          <p className="unsupported-body">
            <strong>{repo.url.replace("https://", "")}</strong> is a valid
            GitHub repository, but this demo does not generate onboarding packs
            for arbitrary repositories at runtime.
          </p>

          <p className="unsupported-body unsupported-body--muted">
            Generating a new pack requires running IBM Bob analysis on the target
            repository and verifying all citations against a pinned commit — a
            process performed offline before the app is built.
          </p>

          <p className="unsupported-body unsupported-body--muted">
            To continue the demo, use the supported Skateshop repository.
          </p>

          <div className="unsupported-actions">
            <button
              type="button"
              className="btn btn--primary btn--md"
              onClick={onTryAnother}
            >
              Try another repository
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
