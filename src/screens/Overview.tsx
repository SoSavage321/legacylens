import { useMemo } from "react";
import { getPack } from "@/src/lib/pack";
import { PHASES, useProgress, type Milestone } from "@/src/lib/progress";
import {
  CLAIMS,
  SHORT_COMMIT,
  confidenceOf,
  isVerified,
  verificationCheckedAt,
  verificationCurrent,
  verificationResolved,
  verificationTotal,
} from "@/src/lib/evidence";
import { EvidenceButton, FileReference, useEvidence } from "@/src/components/Evidence";
import { ConfidenceBadge, PrimaryButton, SecondaryButton, StatusIndicator } from "@/src/components/ui";
import { IconEvidence, IconWarn } from "@/src/components/Icons";
import { BobBriefing, BobBuildTimeline } from "@/src/components/BobBriefing";

const pack = getPack();
const { overview } = pack;

function splitStack(text: string): [string, string] {
  const i = text.indexOf(":");
  return i > 0 && i < 30 ? [text.slice(0, i), text.slice(i + 1).trim()] : ["", text];
}

function missionFor(m: Milestone | undefined, progress: ReturnType<typeof useProgress>["progress"]) {
  if (!m) {
    return {
      kicker: "Journey complete",
      title: "Your first safe change is made and validated.",
      body: "You went from an unfamiliar repository to a verified change. Pick a bigger task, or revisit any workflow.",
      cta: "Review first task",
      route: "task",
    };
  }
  switch (m.id) {
    case "arch": {
      const next = pack.architecture.layers.find((l) => !progress.exploredLayers.includes(l.id));
      return {
        kicker: "Next: map the system",
        title: `Inspect the ${next?.name ?? "architecture"} layer`,
        body: `Skateshop has ${pack.architecture.layers.length} layers and ${pack.architecture.edges.length} observed relationships. Each one links back to the source that proves it.`,
        cta: "Continue investigation",
        route: next ? `architecture/${next.id}` : "architecture",
      };
    }
    case "trace": {
      const next = pack.workflows.workflows.find(
        (w) => pack.quiz.readiness.requiredWorkflowIds.includes(w.id) && !progress.completedWorkflows.includes(w.id)
      );
      return {
        kicker: "Next: trace a workflow",
        title: `Trace ${next?.name ?? "the critical workflows"}`,
        body: next
          ? `${next.steps.length} steps${next.externalServices.length ? `, touching ${next.externalServices.join(" and ")}` : ""}. Follow it end to end with evidence at every hop.`
          : "Follow each critical journey end to end.",
        cta: "Continue investigation",
        route: next ? `workflows/${next.id}` : "workflows",
      };
    }
    case "read": {
      const next = pack.readingOrder.steps
        .filter((s) => s.required)
        .sort((a, b) => a.order - b.order)
        .find((s) => !progress.readSteps.includes(s.id));
      return {
        kicker: "Next: read in the right order",
        title: next ? `Read “${next.title}”` : "Work through the reading path",
        body: next ? `${next.minutes} min · ${next.why}` : "",
        cta: "Continue investigation",
        route: next ? `learn/${next.id}` : "learn",
      };
    }
    case "check":
      return {
        kicker: "Next: prove it",
        title: "Can you navigate this system yet?",
        body: "Answer questions about the real code. Every answer is backed by a citation you can open.",
        cta: "Take the knowledge check",
        route: "learn",
      };
    case "task":
      return {
        kicker: "Unlocked",
        title: "You're ready for your first safe change.",
        body: "A low-risk, single-file task has been selected for you, with its blast radius mapped.",
        cta: "Open first task",
        route: "task",
      };
    default:
      return {
        kicker: "Next",
        title: m.label,
        body: m.detail,
        cta: "Continue investigation",
        route: m.route,
      };
  }
}

export default function OverviewScreen({ navigate }: { navigate: (to: string) => void }) {
  const { milestones, current, progress, readiness } = useProgress();
  const { open } = useEvidence();
  const mission = missionFor(current, progress);

  const basisCounts = useMemo(() => {
    const observed = CLAIMS.filter((c) => c.basis === "observed").length;
    const inferred = CLAIMS.filter((c) => c.basis === "inferred").length;
    return { observed, inferred, total: CLAIMS.length };
  }, []);

  const checkedDate = verificationCheckedAt
    ? new Date(verificationCheckedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="overview">

      <BobBriefing />

      {/* ── The journey ───────────────────────────────────────────── */}
      <section className="journey" aria-labelledby="journey-title">
        <h2 id="journey-title" className="sr-only">
          Your onboarding journey
        </h2>
        <ol className="journey-phases">
          {PHASES.map((phase) => {
            const ms = milestones.filter((m) => m.phase === phase.n);
            const state = ms.every((m) => m.status === "done")
              ? "done"
              : ms.some((m) => m.status === "current" || m.status === "ready")
                ? "active"
                : ms.some((m) => m.status === "locked")
                  ? "locked"
                  : "todo";
            return (
              <li key={phase.n} className={`phase phase--${state}`}>
                <div className="phase-head">
                  <span className="phase-num">{String(phase.n).padStart(2, "0")}</span>
                  <span className="phase-label">{phase.label}</span>
                  <span className="phase-state">
                    {state === "done" ? "✓ DONE" : state === "active" ? "● NOW" : state === "locked" ? "LOCKED" : ""}
                  </span>
                </div>
                <div className="phase-rail" aria-hidden="true">
                  <span className="phase-rail-fill" />
                </div>
                <p className="phase-verb">{phase.verb}</p>
                <ul className="phase-milestones">
                  {ms.map((m) => (
                    <li key={m.id}>
                      <button
                        className={`milestone milestone--${m.status}`}
                        onClick={() => navigate(m.route)}
                      >
                        <StatusIndicator status={m.status} size={18} />
                        <span className="milestone-text">
                          <span className="milestone-label">{m.label}</span>
                          <span className="milestone-detail">{m.detail}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="ov-grid">
        {/* ── MissionCard ──────────────────────────────────────────── */}
        <section className="mission" aria-labelledby="mission-title">
          <div className="mission-kicker">{mission.kicker}</div>
          <h2 id="mission-title" className="mission-title">
            {mission.title}
          </h2>
          {mission.body && <p className="mission-body">{mission.body}</p>}
          <div className="mission-actions">
            <PrimaryButton size="lg" arrow onClick={() => navigate(mission.route)}>
              {mission.cta}
            </PrimaryButton>
            <span className="mission-readiness">
              <span className="mono">{readiness.totalScore}%</span> understood · task unlocks at{" "}
              <span className="mono">{readiness.thresholdPercent}%</span>
            </span>
          </div>
        </section>

        {/* ── Trust ─────────────────────────────────────────────── */}
        <section className="trust" aria-labelledby="trust-title">
          <div className="trust-head">
            <IconEvidence size={18} />
            <h2 id="trust-title">Why trust this?</h2>
          </div>
          <div className="trust-stat">
            <span className={`trust-num ${verificationCurrent ? "tone-verified" : "tone-review"}`}>
              {verificationResolved}/{verificationTotal}
            </span>
            <span className="trust-num-label">
              {verificationCurrent ? "✓ citations resolved" : "⚠ verification is for a different commit"}
              <br />
              at commit <code>{SHORT_COMMIT}</code>
              {checkedDate && <> · checked {checkedDate}</>}
            </span>
          </div>
          <ul className="trust-points">
            <li>
              <span className="tone-verified">✓</span> Every claim links to a file and line range you can open.
            </li>
            <li>
              <span className="tone-verified">✓</span> {basisCounts.observed} claims observed directly in source
              {basisCounts.inferred > 0 && `, ${basisCounts.inferred} inferred`}.
            </li>
            <li>
              <span className="tone-review">⚠</span> Nothing here was executed — validation commands are listed, not run.
            </li>
          </ul>
          <SecondaryButton size="sm" arrow onClick={() => navigate("evidence")}>
            Open verification ledger
          </SecondaryButton>
        </section>
      </div>

      {/* ── Surprises ─────────────────────────────────────────────── */}
      <section className="ov-section" aria-labelledby="facts-title">
        <div className="section-head">
          <h2 id="facts-title" className="section-title">
            What the README won't tell you
          </h2>
          <span className="section-hint">{overview.keyFacts.length} findings · each verified against source</span>
        </div>
        <ul className="facts">
          {overview.keyFacts.map((f, i) => (
            <li key={i} className="fact">
              <IconWarn size={16} className="fact-icon" />
              <p className="fact-text">{f.text}</p>
              <div className="fact-foot">
                <ConfidenceBadge
                  level={confidenceOf(f.basis, f.evidence)}
                  basis={f.basis}
                  citations={f.evidence.filter(isVerified).length}
                  compact
                />
                <EvidenceButton
                  req={{
                    kind: "claim",
                    context: "Overview · Key fact",
                    claim: f.text,
                    basis: f.basis,
                    evidence: f.evidence,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="ov-columns">
        <section className="ov-section" aria-labelledby="entry-title">
          <div className="section-head">
            <h2 id="entry-title" className="section-title">
              Where execution starts
            </h2>
          </div>
          <ul className="entry-list">
            {overview.entryPoints.map((e, i) => (
              <li key={i} className="entry">
                <p>{e.text}</p>
                <div className="entry-refs">
                  {e.evidence.map((ev, j) => (
                    <FileReference key={j} path={ev.path} lines={ev.lines} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="ov-section" aria-labelledby="stack-title">
          <div className="section-head">
            <h2 id="stack-title" className="section-title">
              Stack at a glance
            </h2>
          </div>
          <ul className="stack-list">
            {overview.stack.map((s, i) => {
              const [label, value] = splitStack(s.text);
              return (
                <li key={i}>
                  <button
                    className="stack-row"
                    onClick={() =>
                      open({
                        kind: "claim",
                        context: `Overview · Stack${label ? ` · ${label}` : ""}`,
                        claim: s.text,
                        basis: s.basis,
                        evidence: s.evidence,
                      })
                    }
                  >
                    <span className="stack-key">{label || "—"}</span>
                    <span className="stack-value">{value}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <BobBuildTimeline />
    </div>
  );
}
