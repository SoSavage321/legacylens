import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Basis } from "../types/pack";
import type { ConfidenceLevel } from "../lib/evidence";
import { IconArrowRight, IconCheck, IconLock, IconRisk, IconWarn } from "./Icons";

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  arrow?: boolean;
  size?: "md" | "lg" | "sm";
};

export function PrimaryButton({ arrow, size = "md", className = "", children, ...rest }: ButtonProps) {
  return (
    <button className={`btn btn--primary btn--${size} ${className}`} {...rest}>
      <span>{children}</span>
      {arrow && <IconArrowRight className="btn-arrow" />}
    </button>
  );
}

export function SecondaryButton({ arrow, size = "md", className = "", children, ...rest }: ButtonProps) {
  return (
    <button className={`btn btn--secondary btn--${size} ${className}`} {...rest}>
      <span>{children}</span>
      {arrow && <IconArrowRight className="btn-arrow" />}
    </button>
  );
}

export function GhostButton({ size = "sm", className = "", children, ...rest }: ButtonProps) {
  return (
    <button className={`btn btn--ghost btn--${size} ${className}`} {...rest}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Status language — colour is always paired with a glyph and a word
// ---------------------------------------------------------------------------

export type Tone = "verified" | "review" | "risk" | "info" | "neutral";

const TONE_ICON: Record<Tone, ReactNode> = {
  verified: <IconCheck size={12} strokeWidth={2.4} />,
  review: <IconWarn size={12} strokeWidth={2.2} />,
  risk: <IconRisk size={12} strokeWidth={2.2} />,
  info: null,
  neutral: null,
};

export function Tag({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`tag tag--${tone}`} title={title}>
      {TONE_ICON[tone]}
      {children}
    </span>
  );
}

const CONFIDENCE_COPY: Record<ConfidenceLevel, { label: string; tone: Tone; bars: number }> = {
  high: { label: "High confidence", tone: "verified", bars: 3 },
  medium: { label: "Medium confidence", tone: "review", bars: 2 },
  low: { label: "Low confidence", tone: "risk", bars: 1 },
};

/** Evidence quality, not model certainty: basis + number of citations resolved at the commit. */
export function ConfidenceBadge({
  level,
  basis,
  citations,
  compact,
}: {
  level: ConfidenceLevel;
  basis?: Basis;
  citations: number;
  compact?: boolean;
}) {
  const c = CONFIDENCE_COPY[level];
  const basisText = basis === "inferred" ? "Inferred" : basis === "observed" ? "Observed" : null;
  const title = `${c.label}: ${basisText ? basisText.toLowerCase() + " in source, " : ""}${citations} citation${
    citations === 1 ? "" : "s"
  } resolved at the analysed commit`;
  return (
    <span className={`confidence confidence--${level}`} title={title}>
      <span className="confidence-bars" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= c.bars ? "on" : ""} />
        ))}
      </span>
      <span className="confidence-label">{compact ? level.toUpperCase() : c.label.toUpperCase()}</span>
      {!compact && (
        <span className="confidence-meta">
          {basisText && <>{basisText} · </>}
          {citations} cite{citations === 1 ? "" : "s"}
        </span>
      )}
      <span className="sr-only">{title}</span>
    </span>
  );
}

export function RiskBadge({ risk, large }: { risk: "low" | "medium" | "high"; large?: boolean }) {
  const tone: Tone = risk === "low" ? "verified" : risk === "medium" ? "review" : "risk";
  const segments = risk === "low" ? 1 : risk === "medium" ? 2 : 3;
  return (
    <span className={`risk risk--${risk} ${large ? "risk--large" : ""}`}>
      <span className="risk-meter" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= segments ? "on" : ""} />
        ))}
      </span>
      <span className={`risk-label tone-${tone}`}>
        {TONE_ICON[tone]}
        {risk.toUpperCase()} RISK
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// StatusIndicator — circles communicate state (with shape + label)
// ---------------------------------------------------------------------------

export type Status = "done" | "current" | "todo" | "locked" | "ready" | "gap";

const STATUS_LABEL: Record<Status, string> = {
  done: "Complete",
  current: "In progress",
  todo: "Not started",
  locked: "Locked",
  ready: "Ready",
  gap: "Needs review",
};

export function StatusIndicator({ status, size = 22, label }: { status: Status; size?: number; label?: ReactNode }) {
  return (
    <span className={`status status--${status}`} style={{ width: size, height: size }}>
      {status === "done" && <IconCheck size={size * 0.6} strokeWidth={2.6} />}
      {status === "locked" && <IconLock size={size * 0.56} strokeWidth={2} />}
      {status === "gap" && <span className="status-glyph">!</span>}
      {status === "current" && <span className="status-dot" />}
      {status === "ready" && <span className="status-dot" />}
      {label !== undefined && <span className="status-num">{label}</span>}
      <span className="sr-only">{STATUS_LABEL[status]}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// ProgressIndicator — understanding ring & bar
// ---------------------------------------------------------------------------

export function ProgressRing({
  value,
  size = 36,
  stroke = 3.5,
  threshold,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  threshold?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const passed = threshold !== undefined && value >= threshold;
  return (
    <span className={`ring ${passed ? "ring--passed" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        {threshold !== undefined && (
          <circle
            className="ring-threshold"
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke + 3}
            fill="none"
            strokeDasharray={`1.5 ${c}`}
            strokeDashoffset={-c * (threshold / 100)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, value) / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <span className="ring-center">{children}</span>}
    </span>
  );
}

export function ProgressBar({
  value,
  threshold,
  tone = "info",
  label,
}: {
  value: number;
  threshold?: number;
  tone?: "info" | "verified" | "review";
  label: string;
}) {
  return (
    <div
      className={`bar bar--${tone}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <div className="bar-fill" style={{ width: `${Math.min(100, value)}%` }} />
      {threshold !== undefined && (
        <div className="bar-threshold" style={{ left: `${threshold}%` }} title={`Threshold ${threshold}%`} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

export function ScreenHeader({
  eyebrow,
  title,
  lede,
  aside,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="screen-header">
      <div className="screen-header-main">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="screen-title">{title}</h1>
        {lede && <p className="screen-lede">{lede}</p>}
      </div>
      {aside && <div className="screen-header-aside">{aside}</div>}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3 className="empty-title">{title}</h3>
      <p className="empty-body">{body}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
