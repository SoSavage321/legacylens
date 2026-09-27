import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type { WorkflowId } from "../types/pack";
import { getPack } from "./pack";
import {
  type LearnProgress,
  type ReadinessBreakdown,
  computeReadiness,
  emptyProgress,
  loadProgress,
  resetProgress,
  saveProgress,
} from "./readiness";

const pack = getPack();

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type ProgressAction =
  | { type: "MARK_READ"; stepId: string }
  | { type: "ANSWER"; questionId: string; optionId: string }
  | { type: "RETRY"; questionId: string }
  | { type: "SET_WORKFLOW"; workflowId: WorkflowId; traced: boolean }
  | { type: "EXPLORE_LAYER"; layerId: string }
  | { type: "TOGGLE_TASK_STEP"; stepId: string }
  | { type: "RESET" };

function reducer(state: LearnProgress, action: ProgressAction): LearnProgress {
  switch (action.type) {
    case "MARK_READ":
      if (state.readSteps.includes(action.stepId)) return state;
      return { ...state, readSteps: [...state.readSteps, action.stepId] };
    case "ANSWER":
      if (action.questionId in state.answers) return state; // already answered
      return { ...state, answers: { ...state.answers, [action.questionId]: action.optionId } };
    case "RETRY": {
      const { [action.questionId]: _removed, ...rest } = state.answers;
      void _removed;
      return { ...state, answers: rest };
    }
    case "SET_WORKFLOW": {
      const has = state.completedWorkflows.includes(action.workflowId);
      if (has === action.traced) return state;
      return {
        ...state,
        completedWorkflows: action.traced
          ? [...state.completedWorkflows, action.workflowId]
          : state.completedWorkflows.filter((w) => w !== action.workflowId),
      };
    }
    case "EXPLORE_LAYER":
      if (state.exploredLayers.includes(action.layerId)) return state;
      return { ...state, exploredLayers: [...state.exploredLayers, action.layerId] };
    case "TOGGLE_TASK_STEP": {
      const has = state.taskSteps.includes(action.stepId);
      return {
        ...state,
        taskSteps: has
          ? state.taskSteps.filter((s) => s !== action.stepId)
          : [...state.taskSteps, action.stepId],
      };
    }
    case "RESET":
      return emptyProgress();
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// First-task checklist (derived from the selected candidate)
// ---------------------------------------------------------------------------

export const selectedTask = pack.tasks.candidates.find((c) => c.id === pack.tasks.selectedId)!;

export const TASK_STEPS: { id: string; label: string; command?: string }[] = [
  {
    id: "edit",
    label: `Make the change in ${selectedTask.files.join(", ")}`,
  },
  ...selectedTask.validation.map((cmd) => ({
    id: `validate:${cmd}`,
    label: `Run ${cmd}`,
    command: cmd,
  })),
];

// ---------------------------------------------------------------------------
// Milestones — the UNKNOWN → FIRST SUCCESS journey
// ---------------------------------------------------------------------------

export type MilestoneStatus = "done" | "current" | "todo" | "locked" | "ready";

export interface Milestone {
  id: "orient" | "arch" | "trace" | "read" | "check" | "task";
  phase: 1 | 2 | 3 | 4;
  label: string;
  detail: string;
  route: string;
  done: boolean;
  status: MilestoneStatus;
}

export const PHASES = [
  { n: 1, label: "Understand", verb: "Get oriented and map the system" },
  { n: 2, label: "Trace", verb: "Follow the workflows that matter" },
  { n: 3, label: "Prove", verb: "Show you can navigate it" },
  { n: 4, label: "Change", verb: "Make your first safe change" },
] as const;

function computeMilestones(p: LearnProgress, r: ReadinessBreakdown): Milestone[] {
  const layerIds = pack.architecture.layers.map((l) => l.id);
  const explored = layerIds.filter((id) => p.exploredLayers.includes(id)).length;
  const wfIds = pack.quiz.readiness.requiredWorkflowIds;
  const traced = wfIds.filter((id) => p.completedWorkflows.includes(id)).length;
  const required = pack.readingOrder.steps.filter((s) => s.required);
  const reviewed = required.filter((s) => p.readSteps.includes(s.id)).length;
  const qs = pack.quiz.questions;
  const correct = qs.filter((q) => p.answers[q.id] === q.answerId).length;
  const taskDone = TASK_STEPS.every((s) => p.taskSteps.includes(s.id));

  const base: Omit<Milestone, "status">[] = [
    {
      id: "orient",
      phase: 1,
      label: "Repository orientation",
      detail: "Stack, entry points and surprises",
      route: "overview",
      done: true,
    },
    {
      id: "arch",
      phase: 1,
      label: "Architecture map",
      detail: `${explored} of ${layerIds.length} layers inspected`,
      route: "architecture",
      done: explored === layerIds.length,
    },
    {
      id: "trace",
      phase: 2,
      label: "Critical workflows",
      detail: `${traced} of ${wfIds.length} workflows traced`,
      route: "workflows",
      done: traced === wfIds.length,
    },
    {
      id: "read",
      phase: 3,
      label: "Reading path",
      detail: `${reviewed} of ${required.length} required steps reviewed`,
      route: "learn",
      done: reviewed === required.length,
    },
    {
      id: "check",
      phase: 3,
      label: "Knowledge check",
      detail: `${correct} of ${qs.length} answered correctly`,
      route: "learn",
      done: correct === qs.length,
    },
    {
      id: "task",
      phase: 4,
      label: "First safe task",
      detail: r.passed
        ? taskDone
          ? "Change made and validated"
          : "Unlocked — ready to start"
        : `Unlocks at ${r.thresholdPercent}% understanding`,
      route: "task",
      done: taskDone && r.passed,
    },
  ];

  // Once readiness passes, the task becomes the focus even if optional checks remain.
  const currentId =
    r.passed && !taskDone ? "task" : base.find((m) => !m.done)?.id ?? null;

  return base.map((m) => {
    let status: MilestoneStatus = m.done ? "done" : "todo";
    if (m.id === "task" && !r.passed) status = "locked";
    else if (m.id === "task" && !m.done) status = "ready";
    if (m.id === currentId && !m.done) status = "current";
    return { ...m, status };
  });
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ProgressContextValue {
  progress: LearnProgress;
  dispatch: Dispatch<ProgressAction>;
  readiness: ReadinessBreakdown;
  milestones: Milestone[];
  current: Milestone | undefined;
  reset: () => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, dispatch] = useReducer(reducer, undefined, loadProgress);

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const value = useMemo<ProgressContextValue>(() => {
    const readiness = computeReadiness(pack.readingOrder, pack.quiz, progress);
    const milestones = computeMilestones(progress, readiness);
    return {
      progress,
      dispatch,
      readiness,
      milestones,
      current: milestones.find((m) => m.status === "current"),
      reset: () => {
        resetProgress();
        dispatch({ type: "RESET" });
      },
    };
  }, [progress]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress must be used inside ProgressProvider");
  return ctx;
}

/** Readiness if the given progress change were applied — used to show score deltas. */
export function readinessWith(progress: LearnProgress): ReadinessBreakdown {
  return computeReadiness(pack.readingOrder, pack.quiz, progress);
}
