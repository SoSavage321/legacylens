import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowId } from "@/src/types/pack";
import { getPack } from "@/src/lib/pack";
import { readinessWith, useProgress } from "@/src/lib/progress";
import { computeGaps } from "@/src/lib/readiness";
import { CodeEvidence, FileReference } from "@/src/components/Evidence";
import {
  GhostButton,
  PrimaryButton,
  ProgressBar,
  ProgressRing,
  ScreenHeader,
  SecondaryButton,
  StatusIndicator,
  Tag,
  type Status,
} from "@/src/components/ui";
import { IconCheck, IconChevron, IconClock } from "@/src/components/Icons";

const pack = getPack();
const { readingOrder, quiz } = pack;
const STEPS = [...readingOrder.steps].sort((a, b) => a.order - b.order);
type Step = (typeof STEPS)[number];
type Question = (typeof quiz.questions)[number];

const WORKFLOW_LABELS: Record<WorkflowId, string> = Object.fromEntries(
  pack.workflows.workflows.map((w) => [w.id, w.name])
) as Record<WorkflowId, string>;

const pad = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------
// Readiness strip
// ---------------------------------------------------------------------------

function ReadinessStrip({ navigate }: { navigate: (to: string) => void }) {
  const { readiness: r } = useProgress();
  const { weights } = quiz.readiness;
  const rows = [
    { label: "Reading path", value: r.readingScore, weight: weights.reading },
    { label: "Knowledge check", value: r.quizScore, weight: weights.quiz },
    { label: "Workflows traced", value: r.workflowScore, weight: weights.workflows },
  ];
  return (
    <section className={`readiness ${r.passed ? "readiness--passed" : ""}`} aria-labelledby="readiness-title">
      <div className="readiness-score">
        <ProgressRing value={r.totalScore} threshold={r.thresholdPercent} size={84} stroke={6}>
          <span className="readiness-num">{r.totalScore}%</span>
        </ProgressRing>
        <div>
          <h2 id="readiness-title" className="readiness-title">
            Understanding
          </h2>
          <p className="readiness-sub">
            {r.passed ? (
              <span className="tone-verified">✓ Ready — first task unlocked</span>
            ) : (
              <>
                <span className="mono">{r.thresholdPercent - r.totalScore}%</span> to go · unlocks at{" "}
                <span className="mono">{r.thresholdPercent}%</span>
              </>
            )}
          </p>
          {r.passed && (
            <PrimaryButton size="sm" arrow onClick={() => navigate("task")}>
              Open first task
            </PrimaryButton>
          )}
        </div>
      </div>
      <div className="readiness-rows">
        {rows.map((row) => (
          <div key={row.label} className="readiness-row">
            <span className="readiness-row-label">
              {row.label} <span className="dim mono">×{row.weight / 100}</span>
            </span>
            <ProgressBar value={row.value} tone={row.value === 100 ? "verified" : "info"} label={row.label} />
            <span className="readiness-row-value mono">{row.value}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Reading order
// ---------------------------------------------------------------------------

function ReadingItem({
  step,
  expanded,
  onToggle,
  hasGap,
}: {
  step: Step;
  expanded: boolean;
  onToggle: () => void;
  hasGap: boolean;
}) {
  const { progress, dispatch } = useProgress();
  const ref = useRef<HTMLLIElement>(null);
  const read = progress.readSteps.includes(step.id);
  const questions = quiz.questions.filter((q) => q.readingStepId === step.id).length;
  const status: Status = read ? "done" : hasGap ? "gap" : "todo";

  useEffect(() => {
    if (expanded) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [expanded]);

  return (
    <li ref={ref} className={`read-item ${expanded ? "is-open" : ""} ${read ? "is-read" : ""}`}>
      <div className="read-row">
        <span className="read-num mono">{pad(step.order)}</span>
        <div className="read-main">
          <h3 className="read-title">{step.title}</h3>
          <div className="read-meta">
            <span className="read-time">
              <IconClock size={12} /> {step.minutes} min
            </span>
            {step.required ? <Tag tone="info">REQUIRED</Tag> : <Tag tone="neutral">OPTIONAL</Tag>}
            {questions > 0 && <span className="dim">{questions} question{questions > 1 ? "s" : ""}</span>}
            {hasGap && !read && <Tag tone="risk">GAP · REVIEW TO RETRY</Tag>}
          </div>
        </div>
        <StatusIndicator status={status} size={20} />
        <button className="read-toggle" onClick={onToggle} aria-expanded={expanded} aria-controls={`read-${step.id}`}>
          {expanded ? "Close" : read ? "Revisit" : "Read"}
          <IconChevron size={14} className="read-chev" />
        </button>
      </div>
      {expanded && (
        <div className="read-body" id={`read-${step.id}`}>
          <p className="read-why">{step.why}</p>
          <div className="nd-label">Files to read, in order</div>
          <ol className="read-files">
            {step.paths.map((p) => (
              <li key={p}>
                <FileReference path={p} />
              </li>
            ))}
          </ol>
          <div className="read-foot">
            <span className="dim">
              Workflows: {step.workflowIds.map((w) => WORKFLOW_LABELS[w] ?? w).join(", ")}
            </span>
            {read ? (
              <Tag tone="verified">REVIEWED</Tag>
            ) : (
              <PrimaryButton size="sm" onClick={() => dispatch({ type: "MARK_READ", stepId: step.id })}>
                ✓ Mark as reviewed
              </PrimaryButton>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// QuizCard
// ---------------------------------------------------------------------------

function QuizCard({ navigate }: { navigate: (to: string) => void }) {
  const { progress, dispatch, readiness } = useProgress();
  const questions = quiz.questions;
  const firstOpen = Math.max(
    0,
    questions.findIndex((q) => progress.answers[q.id] !== q.answerId)
  );
  const [index, setIndex] = useState(firstOpen);
  const [choice, setChoice] = useState<string | null>(null);
  const [delta, setDelta] = useState<{ q: string; before: number; after: number } | null>(null);

  const q: Question = questions[index];
  const answered = progress.answers[q.id];
  const correct = answered === q.answerId;
  const step = readingOrder.steps.find((s) => s.id === q.readingStepId);
  const stepRead = progress.readSteps.includes(q.readingStepId);
  const correctCount = questions.filter((x) => progress.answers[x.id] === x.answerId).length;
  const allDone = correctCount === questions.length;

  useEffect(() => setChoice(null), [index]);

  const check = () => {
    if (!choice) return;
    const after = readinessWith({ ...progress, answers: { ...progress.answers, [q.id]: choice } }).totalScore;
    setDelta({ q: q.id, before: readiness.totalScore, after });
    dispatch({ type: "ANSWER", questionId: q.id, optionId: choice });
  };

  const goNext = () => {
    const nextOpen = questions.findIndex((x, i) => i > index && progress.answers[x.id] !== x.answerId);
    const wrap = questions.findIndex((x) => progress.answers[x.id] !== x.answerId);
    const target = nextOpen >= 0 ? nextOpen : wrap >= 0 ? wrap : Math.min(index + 1, questions.length - 1);
    setIndex(target);
  };

  const dotStatus = (x: Question, i: number): string => {
    const a = progress.answers[x.id];
    if (a === undefined) return i === index ? "current" : "todo";
    return a === x.answerId ? "done" : "gap";
  };

  return (
    <section className="quiz" aria-labelledby="quiz-title">
      <div className="quiz-head">
        <div>
          <div className="eyebrow">03 Prove · Knowledge check</div>
          <h2 id="quiz-title" className="quiz-title">
            Can you navigate this system yet?
          </h2>
        </div>
        <span className="quiz-score mono">
          {correctCount}/{questions.length}
        </span>
      </div>

      <div className="quiz-dots" role="group" aria-label="Questions">
        {questions.map((x, i) => (
          <button
            key={x.id}
            className={`quiz-dot quiz-dot--${dotStatus(x, i)} ${i === index ? "is-active" : ""}`}
            onClick={() => setIndex(i)}
            aria-label={`Question ${i + 1}: ${
              progress.answers[x.id] === undefined
                ? "unanswered"
                : progress.answers[x.id] === x.answerId
                  ? "correct"
                  : "needs review"
            }`}
            aria-current={i === index ? "true" : undefined}
          >
            {dotStatus(x, i) === "done" ? "✓" : dotStatus(x, i) === "gap" ? "!" : i + 1}
          </button>
        ))}
      </div>

      {allDone && (
        <div className="quiz-complete">
          <IconCheck size={16} strokeWidth={2.6} /> All {questions.length} answered correctly — you can navigate this
          system.
        </div>
      )}

      <div className="quiz-body" key={q.id}>
        <div className="quiz-meta">
          <span>Q{pad(index + 1)}</span>
          <span>·</span>
          <span>{WORKFLOW_LABELS[q.workflowId] ?? q.workflowId}</span>
        </div>
        <fieldset className="quiz-fieldset" disabled={answered !== undefined}>
          <legend className="quiz-prompt">{q.prompt}</legend>
          <div className="quiz-options">
            {q.options.map((o) => {
              const isChosen = answered !== undefined ? answered === o.id : choice === o.id;
              let state = "";
              if (answered !== undefined && isChosen) state = correct ? "is-correct" : "is-wrong";
              return (
                <label key={o.id} className={`quiz-option ${isChosen ? "is-chosen" : ""} ${state}`}>
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={o.id}
                    checked={isChosen}
                    onChange={() => setChoice(o.id)}
                  />
                  <span className="quiz-radio" aria-hidden="true" />
                  <span className="quiz-option-text">{o.text}</span>
                  {state === "is-correct" && <span className="quiz-mark tone-verified">✓ CORRECT</span>}
                  {state === "is-wrong" && <span className="quiz-mark tone-risk">✗ NOT QUITE</span>}
                </label>
              );
            })}
          </div>
        </fieldset>

        {answered === undefined && (
          <div className="quiz-actions">
            <PrimaryButton onClick={check} disabled={!choice}>
              Check answer
            </PrimaryButton>
            <span className="dim">Covered in reading step {pad(step?.order ?? 0)}</span>
          </div>
        )}

        {answered !== undefined && correct && (
          <div className="quiz-result quiz-result--correct" role="status">
            <div className="quiz-result-head">
              <span className="success-burst" aria-hidden="true">
                <IconCheck size={16} strokeWidth={3} />
              </span>
              <strong>Correct.</strong>
              {delta?.q === q.id && delta.after !== delta.before && (
                <span className="quiz-delta mono">
                  Understanding {delta.before}% <span aria-hidden="true">→</span>
                  <span className="sr-only">to</span> <strong>{delta.after}%</strong>
                </span>
              )}
            </div>
            <p className="quiz-explain">{q.explanation}</p>
            <div className="ev-list">
              {q.evidence.map((ev, i) => (
                <CodeEvidence key={i} ev={ev} />
              ))}
            </div>
            {!allDone && (
              <div className="quiz-actions">
                <PrimaryButton arrow onClick={goNext}>
                  Next question
                </PrimaryButton>
              </div>
            )}
            {readiness.passed && (
              <div className="quiz-actions">
                <SecondaryButton arrow onClick={() => navigate("task")}>
                  First task is unlocked
                </SecondaryButton>
              </div>
            )}
          </div>
        )}

        {answered !== undefined && !correct && (
          <div className="quiz-result quiz-result--gap" role="status">
            <div className="quiz-result-head">
              <span className="tone-risk">!</span>
              <strong>Knowledge gap found.</strong>
            </div>
            <p className="quiz-explain">
              This is covered in reading step {pad(step?.order ?? 0)} — <strong>{step?.title}</strong>.{" "}
              {stepRead
                ? "You've reviewed it — try again."
                : "Review it, then retry. We won't reveal the answer: finding it in the code is the point."}
            </p>
            <div className="quiz-actions">
              {!stepRead && (
                <PrimaryButton onClick={() => navigate(`learn/${q.readingStepId}`)}>
                  Review step {pad(step?.order ?? 0)}
                </PrimaryButton>
              )}
              <SecondaryButton
                disabled={!stepRead}
                onClick={() => dispatch({ type: "RETRY", questionId: q.id })}
                title={stepRead ? undefined : "Mark the linked reading step as reviewed first"}
              >
                Retry question
              </SecondaryButton>
              <GhostButton onClick={goNext}>Skip for now</GhostButton>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function LearnScreen({ stepId, navigate }: { stepId?: string; navigate: (to: string) => void }) {
  const { progress } = useProgress();
  const [open, setOpen] = useState<string | null>(
    stepId ?? STEPS.find((s) => s.required && !progress.readSteps.includes(s.id))?.id ?? null
  );

  useEffect(() => {
    if (stepId) setOpen(stepId);
  }, [stepId]);

  const gaps = useMemo(() => computeGaps(readingOrder, quiz, progress), [progress]);
  const gapSteps = new Set(gaps.map((g) => g.readingStepId));
  const required = STEPS.filter((s) => s.required);
  const requiredMinutes = required.reduce((a, s) => a + s.minutes, 0);
  const reviewed = required.filter((s) => progress.readSteps.includes(s.id)).length;

  return (
    <div className="learn">
      <ScreenHeader
        eyebrow="03 Prove · Learn"
        title="Read in the right order, then prove it"
        lede="The reading path is ordered so each file makes the next one easier. The knowledge check asks about the real code — every answer links to its source."
      />

      <ReadinessStrip navigate={navigate} />

      <div className="learn-layout">
        <section className="reading" aria-labelledby="reading-title">
          <div className="section-head">
            <h2 id="reading-title" className="section-title">
              Reading order
            </h2>
            <span className="section-hint mono">
              {reviewed}/{required.length} required · ~{requiredMinutes} min
            </span>
          </div>
          <ol className="read-list">
            {STEPS.map((s) => (
              <ReadingItem
                key={s.id}
                step={s}
                expanded={open === s.id}
                hasGap={gapSteps.has(s.id)}
                onToggle={() => setOpen(open === s.id ? null : s.id)}
              />
            ))}
          </ol>
        </section>

        <div className="learn-side">
          <QuizCard navigate={navigate} />
        </div>
      </div>
    </div>
  );
}
