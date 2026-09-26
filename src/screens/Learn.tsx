import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { ReadingOrder, Quiz, WorkflowId } from "@/types/pack";
import {
  type LearnProgress,
  computeGaps,
  computeReadiness,
  loadProgress,
  resetProgress,
  saveProgress,
} from "@/lib/readiness";

import readingOrderData from "../../onboarding-pack/reading-order.json";
import quizData from "../../onboarding-pack/quiz.json";

const readingOrder = readingOrderData as unknown as ReadingOrder;
const quiz = quizData as unknown as Quiz;

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type Action =
  | { type: "MARK_READ"; stepId: string }
  | { type: "ANSWER"; questionId: string; optionId: string }
  | { type: "RETRY"; questionId: string }
  | { type: "TOGGLE_WORKFLOW"; workflowId: WorkflowId }
  | { type: "RESET" };

function reducer(state: LearnProgress, action: Action): LearnProgress {
  switch (action.type) {
    case "MARK_READ":
      if (state.readSteps.includes(action.stepId)) return state;
      return { ...state, readSteps: [...state.readSteps, action.stepId] };
    case "ANSWER": {
      if (action.questionId in state.answers) return state; // already answered
      return {
        ...state,
        answers: { ...state.answers, [action.questionId]: action.optionId },
      };
    }
    case "RETRY": {
      const { [action.questionId]: _removed, ...rest } = state.answers;
      void _removed;
      return { ...state, answers: rest };
    }
    case "TOGGLE_WORKFLOW": {
      const has = state.completedWorkflows.includes(action.workflowId);
      return {
        ...state,
        completedWorkflows: has
          ? state.completedWorkflows.filter((w) => w !== action.workflowId)
          : [...state.completedWorkflows, action.workflowId],
      };
    }
    case "RESET":
      return { readSteps: [], answers: {}, completedWorkflows: [] };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKFLOW_LABELS: Record<WorkflowId, string> = {
  auth: "Auth",
  add_to_cart: "Add to Cart",
  checkout_payment: "Checkout & Payment",
  seller_product: "Seller / Product",
  data_layer: "Data Layer",
};

function pct(n: number): string {
  return `${n}%`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  value: number;
  color?: string;
}
function ProgressBar({ value, color = "#3b82d4" }: ProgressBarProps) {
  return (
    <div
      style={{
        height: 8,
        background: "#e5e7eb",
        borderRadius: 4,
        overflow: "hidden",
        width: "100%",
      }}
    >
      <div
        style={{
          height: "100%",
          width: pct(Math.min(100, value)),
          background: color,
          borderRadius: 4,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReadinessPanel
// ---------------------------------------------------------------------------

interface ReadinessPanelProps {
  progress: LearnProgress;
  onToggleWorkflow: (id: WorkflowId) => void;
}

function ReadinessPanel({ progress, onToggleWorkflow }: ReadinessPanelProps) {
  const bd = useMemo(
    () => computeReadiness(readingOrder, quiz, progress),
    [progress]
  );

  const scoreColor = bd.passed ? "#16a34a" : bd.totalScore >= 50 ? "#ca8a04" : "#dc2626";

  return (
    <section style={styles.card}>
      <h2 style={styles.sectionTitle}>Readiness Score</h2>

      {/* total */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 40, fontWeight: 700, color: scoreColor }}>
          {bd.totalScore}
        </span>
        <span style={{ color: "#57606a" }}>/ 100</span>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#57606a" }}>
          Threshold: {bd.thresholdPercent}%{" "}
          {bd.passed ? (
            <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Ready</span>
          ) : (
            <span style={{ color: "#dc2626", fontWeight: 600 }}>✗ Not yet</span>
          )}
        </span>
      </div>
      <ProgressBar value={bd.totalScore} color={scoreColor} />

      {/* components */}
      <table style={styles.scoreTable}>
        <tbody>
          <ScoreRow
            label="Reading"
            value={bd.readingScore}
            weight={quiz.readiness.weights.reading}
          />
          <ScoreRow
            label="Quiz"
            value={bd.quizScore}
            weight={quiz.readiness.weights.quiz}
          />
          <ScoreRow
            label="Workflows"
            value={bd.workflowScore}
            weight={quiz.readiness.weights.workflows}
          />
        </tbody>
      </table>

      {/* workflows checklist */}
      <div style={{ marginTop: 12 }}>
        <h3 style={styles.subTitle}>Required Workflows</h3>
        {quiz.readiness.requiredWorkflowIds.map((wid) => {
          const done = progress.completedWorkflows.includes(wid);
          return (
            <label key={wid} style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={done}
                onChange={() => onToggleWorkflow(wid)}
              />
              <span style={{ marginLeft: 6 }}>
                {WORKFLOW_LABELS[wid] ?? wid}
              </span>
              {done && (
                <span style={{ marginLeft: 6, color: "#16a34a", fontSize: 12 }}>
                  ✓ covered
                </span>
              )}
            </label>
          );
        })}
        {!bd.requiredWorkflowsCovered && (
          <p style={{ fontSize: 12, color: "#ca8a04", marginTop: 6 }}>
            Missing:{" "}
            {bd.missingWorkflows
              .map((w) => WORKFLOW_LABELS[w] ?? w)
              .join(", ")}
          </p>
        )}
      </div>
    </section>
  );
}

interface ScoreRowProps {
  label: string;
  value: number;
  weight: number;
}
function ScoreRow({ label, value, weight }: ScoreRowProps) {
  const color = value >= 80 ? "#16a34a" : value >= 50 ? "#ca8a04" : "#dc2626";
  return (
    <tr>
      <td style={{ paddingRight: 8, fontSize: 13, color: "#57606a", whiteSpace: "nowrap" }}>
        {label} (×{weight / 100})
      </td>
      <td style={{ width: "100%", paddingRight: 8 }}>
        <ProgressBar value={value} color={color} />
      </td>
      <td style={{ fontSize: 13, fontWeight: 600, color, whiteSpace: "nowrap" }}>
        {value}%
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// GapsPanel
// ---------------------------------------------------------------------------

interface GapsPanelProps {
  progress: LearnProgress;
  onRetry: (questionId: string) => void;
}

function GapsPanel({ progress, onRetry }: GapsPanelProps) {
  const gaps = useMemo(
    () => computeGaps(readingOrder, quiz, progress),
    [progress]
  );

  if (gaps.length === 0) {
    return (
      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Knowledge Gaps</h2>
        <p style={{ color: "#16a34a", fontSize: 13 }}>No open gaps — great work!</p>
      </section>
    );
  }

  return (
    <section style={styles.card}>
      <h2 style={styles.sectionTitle}>Knowledge Gaps</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {gaps.map((gap) => (
          <li key={gap.questionId} style={styles.gapItem}>
            <span style={{ flex: 1, fontSize: 13 }}>
              Review step {gap.stepOrder}: <strong>{gap.stepTitle}</strong>
            </span>
            <button
              style={{
                ...styles.btn,
                ...(gap.retryUnlocked ? styles.btnPrimary : styles.btnDisabled),
              }}
              disabled={!gap.retryUnlocked}
              onClick={() => onRetry(gap.questionId)}
              title={
                gap.retryUnlocked
                  ? "Retry this question"
                  : "Mark the linked reading step as Reviewed first"
              }
            >
              Retry
            </button>
          </li>
        ))}
      </ul>
      {gaps.some((g) => !g.retryUnlocked) && (
        <p style={{ fontSize: 11, color: "#57606a", marginTop: 8 }}>
          Retry is disabled until the linked reading step is marked Reviewed.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// QuestionBlock
// ---------------------------------------------------------------------------

interface QuestionBlockProps {
  questionId: string;
  progress: LearnProgress;
  onAnswer: (questionId: string, optionId: string) => void;
}

function QuestionBlock({ questionId, progress, onAnswer }: QuestionBlockProps) {
  const q = quiz.questions.find((x) => x.id === questionId)!;
  const chosen = progress.answers[q.id];
  const answered = chosen !== undefined;
  const isCorrect = chosen === q.answerId;

  return (
    <div style={styles.questionBlock}>
      <p style={{ margin: "0 0 8px", fontWeight: 500, fontSize: 13 }}>{q.prompt}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {q.options.map((opt) => {
          let bg = "#f7f8fa";
          let border = "1px solid #e5e7eb";
          let color = "#1f2328";
          if (answered) {
            if (opt.id === q.answerId) {
              bg = "#dcfce7";
              border = "1px solid #16a34a";
              color = "#15803d";
            } else if (opt.id === chosen) {
              bg = "#fee2e2";
              border = "1px solid #dc2626";
              color = "#b91c1c";
            }
          }
          return (
            <button
              key={opt.id}
              disabled={answered}
              onClick={() => onAnswer(q.id, opt.id)}
              style={{
                background: bg,
                border,
                color,
                borderRadius: 6,
                padding: "6px 10px",
                textAlign: "left",
                cursor: answered ? "default" : "pointer",
                fontSize: 13,
              }}
            >
              {opt.text}
            </button>
          );
        })}
      </div>

      {answered && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 6,
            background: isCorrect ? "#f0fdf4" : "#fef2f2",
            borderLeft: `3px solid ${isCorrect ? "#16a34a" : "#dc2626"}`,
            fontSize: 12,
            color: "#1f2328",
          }}
        >
          <strong style={{ color: isCorrect ? "#16a34a" : "#dc2626" }}>
            {isCorrect ? "✓ Correct" : "✗ Incorrect"}
          </strong>{" "}
          — {q.explanation}
          {q.evidence.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
              {q.evidence.map((ev, i) => (
                <li key={i} style={{ fontSize: 11, color: "#57606a" }}>
                  <code>{ev.path}</code>
                  {ev.lines && (
                    <span>
                      {" "}
                      lines {ev.lines[0]}–{ev.lines[1]}
                    </span>
                  )}
                  {ev.note && <span> — {ev.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReadingStep
// ---------------------------------------------------------------------------

interface ReadingStepProps {
  step: ReadingOrder["steps"][number];
  progress: LearnProgress;
  onMarkRead: (id: string) => void;
  onAnswer: (questionId: string, optionId: string) => void;
}

function ReadingStep({ step, progress, onMarkRead, onAnswer }: ReadingStepProps) {
  const isRead = progress.readSteps.includes(step.id);
  const stepQuestions = quiz.questions.filter((q) => q.readingStepId === step.id);

  return (
    <div style={{ ...styles.card, opacity: 1 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          style={{
            flexShrink: 0,
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: isRead ? "#16a34a" : "#3b82d4",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {step.order}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{step.title}</h3>
            <span style={{ fontSize: 11, color: "#57606a" }}>~{step.minutes} min</span>
            {!step.required && (
              <span
                style={{
                  fontSize: 10,
                  background: "#f7f8fa",
                  border: "1px solid #e5e7eb",
                  borderRadius: 4,
                  padding: "1px 5px",
                  color: "#57606a",
                }}
              >
                optional
              </span>
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#57606a" }}>{step.why}</p>
        </div>
      </div>

      {/* paths */}
      <div style={{ marginTop: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#57606a", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Files to read
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
          {step.paths.map((p) => (
            <code key={p} style={styles.pathChip}>
              {p}
            </code>
          ))}
        </div>
      </div>

      {/* mark read */}
      <label style={{ ...styles.checkLabel, marginTop: 10 }}>
        <input
          type="checkbox"
          checked={isRead}
          onChange={() => {
            if (!isRead) onMarkRead(step.id);
          }}
          readOnly={isRead}
        />
        <span style={{ marginLeft: 6, fontSize: 13 }}>
          {isRead ? "✓ Marked as Reviewed" : "Mark as Reviewed"}
        </span>
      </label>

      {/* questions */}
      {stepQuestions.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#57606a",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Quiz ({stepQuestions.length} question{stepQuestions.length > 1 ? "s" : ""})
          </span>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 12 }}>
            {stepQuestions.map((q) => (
              <QuestionBlock
                key={q.id}
                questionId={q.id}
                progress={progress}
                onAnswer={onAnswer}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Learn screen
// ---------------------------------------------------------------------------

export default function Learn() {
  const [progress, dispatch] = useReducer(reducer, undefined, loadProgress);

  // Persist on every change
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const handleMarkRead = useCallback((stepId: string) => {
    dispatch({ type: "MARK_READ", stepId });
  }, []);

  const handleAnswer = useCallback((questionId: string, optionId: string) => {
    dispatch({ type: "ANSWER", questionId, optionId });
  }, []);

  const handleRetry = useCallback((questionId: string) => {
    dispatch({ type: "RETRY", questionId });
  }, []);

  const handleToggleWorkflow = useCallback((workflowId: WorkflowId) => {
    dispatch({ type: "TOGGLE_WORKFLOW", workflowId });
  }, []);

  const handleReset = useCallback(() => {
    if (window.confirm("Reset all progress? This cannot be undone.")) {
      resetProgress();
      dispatch({ type: "RESET" });
    }
  }, []);

  const sortedSteps = useMemo(
    () => [...readingOrder.steps].sort((a, b) => a.order - b.order),
    []
  );

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Onboarding — Learn</h1>
          <p style={styles.subtitle}>
            Work through the reading path, answer quiz questions, and track
            workflow coverage to reach readiness.
          </p>
        </div>
        <button onClick={handleReset} style={{ ...styles.btn, ...styles.btnDanger }}>
          Reset Progress
        </button>
      </header>

      <div style={styles.layout}>
        {/* Left: reading path */}
        <main style={styles.main}>
          <h2 style={{ ...styles.sectionTitle, marginBottom: 12 }}>
            Reading Path
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {sortedSteps.map((step) => (
              <ReadingStep
                key={step.id}
                step={step}
                progress={progress}
                onMarkRead={handleMarkRead}
                onAnswer={handleAnswer}
              />
            ))}
          </div>
        </main>

        {/* Right: sidebar */}
        <aside style={styles.sidebar}>
          <ReadinessPanel
            progress={progress}
            onToggleWorkflow={handleToggleWorkflow}
          />
          <GapsPanel progress={progress} onRetry={handleRetry} />
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  page: {
    fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif',
    fontSize: 14,
    lineHeight: 1.6,
    color: "#1f2328",
    background: "#f7f8fa",
    minHeight: "100vh",
    padding: "24px 16px 48px",
    boxSizing: "border-box" as const,
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    maxWidth: 1100,
    margin: "0 auto 24px",
    flexWrap: "wrap" as const,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 13,
    color: "#57606a",
  },
  layout: {
    display: "flex",
    gap: 20,
    maxWidth: 1100,
    margin: "0 auto",
    alignItems: "flex-start",
    flexWrap: "wrap" as const,
  },
  main: {
    flex: "1 1 560px",
    minWidth: 0,
  },
  sidebar: {
    flex: "0 0 300px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 16,
  },
  sectionTitle: {
    margin: "0 0 12px",
    fontSize: 15,
    fontWeight: 700,
  },
  subTitle: {
    margin: "0 0 6px",
    fontSize: 13,
    fontWeight: 600,
    color: "#57606a",
  },
  scoreTable: {
    width: "100%",
    borderCollapse: "collapse" as const,
    marginTop: 12,
  },
  checkLabel: {
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 4,
  },
  pathChip: {
    fontSize: 11,
    background: "#f7f8fa",
    border: "1px solid #e5e7eb",
    borderRadius: 4,
    padding: "2px 6px",
    color: "#3b82d4",
  },
  questionBlock: {
    background: "#fafafa",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    padding: "10px 12px",
  },
  gapItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 0",
    borderBottom: "1px solid #e5e7eb",
  },
  btn: {
    padding: "5px 12px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
  },
  btnPrimary: {
    background: "#3b82d4",
    border: "1px solid #3b82d4",
    color: "#fff",
  },
  btnDanger: {
    background: "#fff",
    border: "1px solid #dc2626",
    color: "#dc2626",
  },
  btnDisabled: {
    background: "#f7f8fa",
    border: "1px solid #e5e7eb",
    color: "#9ca3af",
    cursor: "not-allowed",
  },
} as const;
