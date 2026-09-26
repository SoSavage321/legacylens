import type {
  Overview,
  Architecture,
  Workflows,
  ReadingOrder,
  Quiz,
  Tasks,
} from "../types/pack";

import overviewJson from "../../onboarding-pack/overview.json";
import architectureJson from "../../onboarding-pack/architecture.json";
import workflowsJson from "../../onboarding-pack/workflows.json";
import readingOrderJson from "../../onboarding-pack/reading-order.json";
import quizJson from "../../onboarding-pack/quiz.json";
import tasksJson from "../../onboarding-pack/tasks.json";
import verificationJson from "../../onboarding-pack/verification.json";

export interface Verification {
  repoCommit: string;
  checkedAt?: string;
  total?: number;
  passed?: number;
  failed?: number;
  [key: string]: unknown;
}

export interface OnboardingPack {
  overview: Overview;
  architecture: Architecture;
  workflows: Workflows;
  readingOrder: ReadingOrder;
  quiz: Quiz;
  tasks: Tasks;
  verification: Verification;
}

const pack: OnboardingPack = {
  overview: overviewJson as Overview,
  architecture: architectureJson as Architecture,
  workflows: workflowsJson as Workflows,
  readingOrder: readingOrderJson as ReadingOrder,
  quiz: quizJson as Quiz,
  tasks: tasksJson as unknown as Tasks,
  verification: verificationJson as Verification,
};

export function getPack(): OnboardingPack {
  return pack;
}

export function getOverview(): Overview {
  return pack.overview;
}

/** Returns the first 7 characters of the verified repo commit. */
export function shortCommit(pack: OnboardingPack): string {
  return pack.overview.meta.repoCommit.slice(0, 7);
}

/** Returns the repository name from overview metadata. */
export function repoName(pack: OnboardingPack): string {
  return pack.overview.repo.name;
}