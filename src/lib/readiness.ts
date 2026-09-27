import type { ReadingOrder, Quiz, WorkflowId } from "../types/pack";

// ---------------------------------------------------------------------------
// Persisted state shape
// ---------------------------------------------------------------------------

export interface LearnProgress {
  /** step ids that have been marked "Reviewed" */
  readSteps: string[];
  /** question id → chosen option id */
  answers: Record<string, string>;
  /** workflow ids the user has run */
  completedWorkflows: WorkflowId[];
  /** architecture layer ids the user has inspected */
  exploredLayers: string[];
  /** first-task checklist items the user has confirmed */
  taskSteps: string[];
}

const EMPTY_PROGRESS: LearnProgress = {
  readSteps: [],
  answers: {},
  completedWorkflows: [],
  exploredLayers: [],
  taskSteps: [],
};

export function emptyProgress(): LearnProgress {
  return { ...EMPTY_PROGRESS };
}

const STORAGE_KEY = "legacylens_progress";

export function loadProgress(): LearnProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Merge over defaults so progress saved by older builds stays loadable
    if (raw) return { ...EMPTY_PROGRESS, ...(JSON.parse(raw) as Partial<LearnProgress>) };
  } catch {
    // ignore
  }
  return emptyProgress();
}

export function saveProgress(p: LearnProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // storage unavailable (private mode) — progress stays in memory
  }
}

export function resetProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Readiness score
// ---------------------------------------------------------------------------

export interface ReadinessBreakdown {
  readingScore: number;   // 0–100
  quizScore: number;      // 0–100
  workflowScore: number;  // 0–100
  totalScore: number;     // 0–100 (weighted)
  thresholdPercent: number;
  passed: boolean;
  requiredWorkflowsCovered: boolean;
  missingWorkflows: WorkflowId[];
}

export function computeReadiness(
  readingOrder: ReadingOrder,
  quiz: Quiz,
  progress: LearnProgress
): ReadinessBreakdown {
  const { thresholdPercent, weights, requiredWorkflowIds } = quiz.readiness;

  // Reading: fraction of required steps reviewed
  const requiredSteps = readingOrder.steps.filter((s) => s.required);
  const reviewedRequired = requiredSteps.filter((s) =>
    progress.readSteps.includes(s.id)
  ).length;
  const readingScore =
    requiredSteps.length > 0
      ? Math.round((reviewedRequired / requiredSteps.length) * 100)
      : 100;

  // Quiz: fraction of questions answered correctly
  const correct = quiz.questions.filter(
    (q) => progress.answers[q.id] === q.answerId
  ).length;
  const quizScore =
    quiz.questions.length > 0
      ? Math.round((correct / quiz.questions.length) * 100)
      : 100;

  // Workflows: fraction of required workflows completed
  const completedRequired = requiredWorkflowIds.filter((id) =>
    progress.completedWorkflows.includes(id)
  ).length;
  const workflowScore =
    requiredWorkflowIds.length > 0
      ? Math.round((completedRequired / requiredWorkflowIds.length) * 100)
      : 100;

  const totalScore = Math.round(
    (readingScore * weights.reading +
      quizScore * weights.quiz +
      workflowScore * weights.workflows) /
      100
  );

  const missingWorkflows = requiredWorkflowIds.filter(
    (id) => !progress.completedWorkflows.includes(id)
  );

  return {
    readingScore,
    quizScore,
    workflowScore,
    totalScore,
    thresholdPercent,
    passed: totalScore >= thresholdPercent,
    requiredWorkflowsCovered: missingWorkflows.length === 0,
    missingWorkflows,
  };
}

// ---------------------------------------------------------------------------
// Knowledge gaps
// ---------------------------------------------------------------------------

export interface KnowledgeGap {
  questionId: string;
  readingStepId: string;
  stepOrder: number;
  stepTitle: string;
  /** true once the linked reading step is marked reviewed */
  retryUnlocked: boolean;
}

export function computeGaps(
  readingOrder: ReadingOrder,
  quiz: Quiz,
  progress: LearnProgress
): KnowledgeGap[] {
  return quiz.questions
    .filter((q) => {
      const answered = q.id in progress.answers;
      const correct = progress.answers[q.id] === q.answerId;
      return answered && !correct;
    })
    .map((q) => {
      const step = readingOrder.steps.find((s) => s.id === q.readingStepId);
      return {
        questionId: q.id,
        readingStepId: q.readingStepId,
        stepOrder: step?.order ?? 0,
        stepTitle: step?.title ?? q.readingStepId,
        retryUnlocked: progress.readSteps.includes(q.readingStepId),
      };
    });
}
