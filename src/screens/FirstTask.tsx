import { useState } from "react";
import { getPack } from "@/src/lib/pack";
import { TASK_STEPS, selectedTask, useProgress } from "@/src/lib/progress";
import { formatLines } from "@/src/lib/evidence";
import { EvidenceButton, FileReference, useEvidence } from "@/src/components/Evidence";
import {
  GhostButton,
  PrimaryButton,
  RiskBadge,
  SecondaryButton,
  StatusIndicator,
  Tag,
} from "@/src/components/ui";
import { IconCheck, IconCopy, IconLock, IconTask, IconUnlock, IconWarn } from "@/src/components/Icons";

const pack = getPack();
const { tasks, architecture, workflows } = pack;
const task = selectedTask;
const br = tasks.blastRadius;

const changedFiles = br.changedFiles.length ? br.changedFiles : task.files;
const noTestsFact = pack.overview.keyFacts.find((f) => /no automated tests/i.test(f.text));
const workflowName = workflows.workflows.find((w) => w.id === task.workflowId)?.name ?? task.workflowId;

/** Rings from the innermost change outward, built from the task's own citations. */
function blastRings() {
  const onFile = task.evidence
    .filter((e) => changedFiles.includes(e.path) && e.lines)
    .sort((a, b) => a.lines![1] - a.lines![0] - (b.lines![1] - b.lines![0]));
  const rings: { label: string; sub: string; tone: "change" | "scope" | "review" | "dep" }[] = onFile.map((e, i) => ({
    label: `${e.path} ${formatLines(e)}`,
    sub: e.note ?? "",
    tone: i === 0 ? "change" : "scope",
  }));
  rings.push({ label: changedFiles.join(", "), sub: "Changed file", tone: "scope" });
  if (br.directDependents.length) {
    rings.push({
      label: `${br.directDependents.length} direct dependents`,
      sub: br.directDependents.map((d) => d.path).join(", "),
      tone: "dep",
    });
  } else {
    rings.push({
      label: "Callers of the changed code",
      sub: "Not enumerated in the pack — check with a quick search before you commit",
      tone: "review",
    });
  }
  return rings;
}

function layerTouched(paths: string[]) {
  return paths.some((p) => changedFiles.some((f) => (p.endsWith("/") ? f.startsWith(p) : f === p)));
}

// ---------------------------------------------------------------------------
// Blast radius
// ---------------------------------------------------------------------------

function BlastRadius() {
  const rings = blastRings();
  const layers = architecture.layers.map((l) => ({ ...l, touched: layerTouched(l.paths) }));
  const untouched = layers.filter((l) => !l.touched);
  const size = 300;
  const c = size / 2;
  const step = (c - 22) / rings.length;

  return (
    <section className="blast" aria-labelledby="blast-title">
      <div className="section-head">
        <h2 id="blast-title" className="section-title">
          Blast radius
        </h2>
        <RiskBadge risk={task.risk} />
      </div>
      <div className="blast-layout">
        <div className="blast-viz">
          <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Blast radius: ${task.risk} risk, ${rings.length} rings`}>
            {[...rings].reverse().map((r, ri) => {
              const i = rings.length - 1 - ri;
              const radius = 22 + step * (i + 1) - 4;
              return (
                <circle
                  key={i}
                  cx={c}
                  cy={c}
                  r={radius}
                  className={`blast-ring blast-ring--${r.tone}`}
                  style={{ animationDelay: `${i * 90}ms` }}
                />
              );
            })}
            <circle cx={c} cy={c} r={18} className="blast-core" />
            <text x={c} y={c + 4} textAnchor="middle" className="blast-core-text">
              EDIT
            </text>
          </svg>
        </div>
        <ol className="blast-legend">
          {rings.map((r, i) => (
            <li key={i} className={`blast-legend-item blast-legend-item--${r.tone}`}>
              <span className="blast-swatch" aria-hidden="true" />
              <div>
                <div className="blast-legend-label">
                  <code>{r.label}</code>
                  {r.tone === "review" && <Tag tone="review">REVIEW</Tag>}
                  {r.tone === "change" && <Tag tone="info">CHANGE</Tag>}
                </div>
                {r.sub && <div className="blast-legend-sub">{r.sub}</div>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="blast-outside">
        <div className="nd-label">
          Outside the blast radius · {untouched.length} of {layers.length} layers have no changed files
        </div>
        <ul className="unaffected">
          {layers.map((l) => (
            <li key={l.id} className={`unaffected-item ${l.touched ? "is-touched" : ""}`}>
              {l.touched ? (
                <Tag tone="review">CHANGED</Tag>
              ) : (
                <span className="unaffected-mark" aria-hidden="true">
                  <IconCheck size={11} strokeWidth={3} />
                </span>
              )}
              <span>{l.name}</span>
              <span className="sr-only">{l.touched ? "has changed files" : "no changed files"}</span>
            </li>
          ))}
        </ul>
        <p className="blast-note">
          External dependency risk: <span className="mono">{task.externalDependencyRisk}</span>
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// TaskCard
// ---------------------------------------------------------------------------

function TaskCard() {
  const { open } = useEvidence();
  const reasons: { tone: "verified" | "review"; text: string; ev?: typeof noTestsFact }[] = [
    { tone: "verified", text: `${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"} to change` },
    { tone: "verified", text: `Rated ${task.risk} risk after comparing ${tasks.candidates.length} candidates` },
    {
      tone: task.externalDependencyRisk.startsWith("none") ? "verified" : "review",
      text: task.externalDependencyRisk.startsWith("none")
        ? "No external services involved"
        : `External risk: ${task.externalDependencyRisk}`,
    },
    { tone: "verified", text: `${task.validation.length} CI checks validate it: ${task.validation.join(", ")}` },
    { tone: "verified", text: `Part of the ${workflowName} area you've already studied` },
  ];
  if (noTestsFact) reasons.push({ tone: "review", text: "The repo has no automated test suite — review by eye", ev: noTestsFact });

  return (
    <article className="task-card" aria-labelledby="task-title">
      <div className="task-card-top">
        <span className="eyebrow">
          <IconTask size={12} /> Your first task
        </span>
        <RiskBadge risk={task.risk} large />
      </div>
      <h2 id="task-title" className="task-title">
        {task.title}
      </h2>
      <p className="task-reason">{task.reason}</p>

      <div className="task-files">
        <div className="nd-label">Files</div>
        {changedFiles.map((f) => {
          const ev = task.evidence.find((e) => e.path === f && e.lines);
          return <FileReference key={f} path={f} lines={ev?.lines} />;
        })}
      </div>

      <div className="task-why">
        <div className="nd-label">Why this task?</div>
        <ul>
          {reasons.map((r, i) => (
            <li key={i} className={`why-item why-item--${r.tone}`}>
              <span className="why-mark" aria-hidden="true">
                {r.tone === "verified" ? <IconCheck size={13} strokeWidth={2.8} /> : <IconWarn size={13} />}
              </span>
              <span>{r.text}</span>
              {r.ev && (
                <EvidenceButton
                  label="Source"
                  req={{ kind: "claim", context: "Overview · Key fact", claim: r.ev.text, basis: r.ev.basis, evidence: r.ev.evidence }}
                />
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="task-actions">
        <PrimaryButton
          size="lg"
          arrow
          onClick={() =>
            open({
              kind: "claim",
              context: `First task · ${task.title}`,
              claim: task.reason,
              why: `Chosen over ${tasks.candidates.length - 1} other candidates. External dependency risk: ${task.externalDependencyRisk}.`,
              evidence: task.evidence,
            })
          }
        >
          Inspect task
        </PrimaryButton>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Path to first success
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="icon-btn icon-btn--sm"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          },
          () => undefined
        );
      }}
      aria-label={copied ? "Copied" : `Copy ${text}`}
      title={copied ? "Copied" : "Copy command"}
    >
      {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
    </button>
  );
}

function SuccessPath() {
  const { progress, dispatch, readiness } = useProgress();
  const done = TASK_STEPS.filter((s) => progress.taskSteps.includes(s.id)).length;
  const complete = done === TASK_STEPS.length;
  const rollback = br.rollback || `git restore ${changedFiles.join(" ")}`;

  return (
    <section className={`success-path ${complete ? "is-complete" : ""}`} aria-labelledby="path-title">
      <div className="section-head">
        <h2 id="path-title" className="section-title">
          Path to first success
        </h2>
        <span className="section-hint mono">
          {done}/{TASK_STEPS.length}
        </span>
      </div>
      <ol className="path-list">
        {TASK_STEPS.map((s, i) => {
          const checked = progress.taskSteps.includes(s.id);
          return (
            <li key={s.id} className={`path-item ${checked ? "is-done" : ""}`}>
              <label className="path-check">
                <input
                  type="checkbox"
                  disabled={!readiness.passed}
                  checked={checked}
                  onChange={() => dispatch({ type: "TOGGLE_TASK_STEP", stepId: s.id })}
                />
                <StatusIndicator status={checked ? "done" : "todo"} size={20} label={checked ? undefined : i + 1} />
                <span className="path-label">
                  {s.command ? (
                    <>
                      Run <code className="cmd">{s.command}</code>
                    </>
                  ) : (
                    s.label
                  )}
                </span>
              </label>
              {s.command && <CopyButton text={s.command} />}
            </li>
          );
        })}
      </ol>
      <p className="path-note">
        {!readiness.passed && "Unlocks with the task. "}
        Self-reported — LegacyLens doesn't run commands on your machine.{" "}
        {br.validation.length === 0 && "No validation results have been recorded for this task yet."}
      </p>
      <div className="rollback">
        <span className="nd-label">Rollback</span>
        <code className="cmd">{rollback}</code>
        <CopyButton text={rollback} />
      </div>

      {complete && (
        <div className="first-success" role="status">
          <span className="success-burst success-burst--lg" aria-hidden="true">
            <IconCheck size={22} strokeWidth={3} />
          </span>
          <div>
            <div className="eyebrow tone-verified">First success</div>
            <strong>From “I don't know this repository” to a validated change.</strong>
            <p>Open a PR with the diff and the {task.validation.length} passing checks as your evidence.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function OtherCandidates() {
  const others = tasks.candidates.filter((c) => c.id !== task.id);
  return (
    <details className="others">
      <summary>
        Why not something else? <span className="dim">{others.length} other candidates considered</span>
      </summary>
      <ul className="others-list">
        {others.map((c) => (
          <li key={c.id} className="other">
            <div className="other-head">
              <span className="other-title">{c.title}</span>
              <RiskBadge risk={c.risk} />
              {c.decision === "rejected" ? <Tag tone="risk">NOT CHOSEN</Tag> : <Tag tone="neutral">ALTERNATIVE</Tag>}
            </div>
            <p className="other-reason">{c.reason}</p>
            <EvidenceButton
              req={{ kind: "claim", context: `First task candidate · ${c.title}`, claim: c.reason, evidence: c.evidence }}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

function LockedGate({ onPreview, navigate }: { onPreview: () => void; navigate: (to: string) => void }) {
  const { readiness: r, progress } = useProgress();
  const required = pack.readingOrder.steps.filter((s) => s.required);
  const unread = required.filter((s) => !progress.readSteps.includes(s.id)).length;
  const wrong = pack.quiz.questions.filter((q) => progress.answers[q.id] !== q.answerId).length;
  const untraced = r.missingWorkflows.length;
  return (
    <section className="gate" aria-labelledby="gate-title">
      <span className="gate-lock" aria-hidden="true">
        <IconLock size={26} />
      </span>
      <div className="eyebrow">04 Change · Locked</div>
      <h1 id="gate-title" className="gate-title">
        Not yet — but you're getting there.
      </h1>
      <p className="gate-lede">
        Your first task unlocks at <strong className="mono">{r.thresholdPercent}%</strong> understanding. You're at{" "}
        <strong className="mono">{r.totalScore}%</strong>.
      </p>
      <div className="gate-bar">
        <div className="gate-bar-fill" style={{ width: `${r.totalScore}%` }} />
        <div className="gate-bar-threshold" style={{ left: `${r.thresholdPercent}%` }} />
      </div>
      <ul className="gate-todo">
        {unread > 0 && (
          <li>
            <span>
              Review <strong>{unread}</strong> more required reading step{unread > 1 ? "s" : ""}
            </span>
            <GhostButton onClick={() => navigate("learn")}>Reading path →</GhostButton>
          </li>
        )}
        {wrong > 0 && (
          <li>
            <span>
              Answer <strong>{wrong}</strong> more knowledge-check question{wrong > 1 ? "s" : ""} correctly
            </span>
            <GhostButton onClick={() => navigate("learn")}>Knowledge check →</GhostButton>
          </li>
        )}
        {untraced > 0 && (
          <li>
            <span>
              Trace <strong>{untraced}</strong> more workflow{untraced > 1 ? "s" : ""}
            </span>
            <GhostButton onClick={() => navigate("workflows")}>Workflows →</GhostButton>
          </li>
        )}
      </ul>
      <p className="gate-note">You don't need all of these — any mix that reaches {r.thresholdPercent}% unlocks the task.</p>
      <SecondaryButton size="sm" onClick={onPreview}>
        Preview the task anyway
      </SecondaryButton>
    </section>
  );
}

export default function FirstTaskScreen({ navigate }: { navigate: (to: string) => void }) {
  const { readiness } = useProgress();
  const [preview, setPreview] = useState(false);

  if (!readiness.passed && !preview) return <LockedGate onPreview={() => setPreview(true)} navigate={navigate} />;

  return (
    <div className="first-task">
      <header className="ft-hero">
        <div className={`ft-readiness ${readiness.passed ? "is-ready" : ""}`}>
          <span className="ft-readiness-icon">{readiness.passed ? <IconUnlock size={18} /> : <IconLock size={18} />}</span>
          <span className="ft-readiness-text">{readiness.passed ? "READY" : "PREVIEW · LOCKED"}</span>
          <span className="mono dim">{readiness.totalScore}%</span>
        </div>
        <div className="eyebrow">04 Change · First task</div>
        <h1 className="ft-title">{readiness.passed ? "You're ready." : "A preview of what you're working toward."}</h1>
        <p className="screen-lede">
          {readiness.passed
            ? "You understand enough of the system to make a controlled change."
            : `Reach ${readiness.thresholdPercent}% understanding to unlock this task.`}
        </p>
      </header>

      <div className="ft-layout">
        <TaskCard />
        <BlastRadius />
      </div>
      <SuccessPath />
      <OtherCandidates />
    </div>
  );
}
