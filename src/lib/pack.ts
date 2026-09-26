import type { Overview, Architecture, Tasks } from "@/src/types/pack";
import raw from "@/src/data/onboarding-pack.json";

export interface OnboardingPack {
  overview: Overview;
  architecture: Architecture;
  tasks: Tasks;
}

const pack = raw as unknown as OnboardingPack;

export function getPack(): OnboardingPack {
  return pack;
}

export function getOverview(): Overview {
  return pack.overview;
}

/** Returns the first 7 characters of the commit hash from overview meta. */
export function shortCommit(pack: OnboardingPack): string {
  return pack.overview.meta.repoCommit.slice(0, 7);
}

/** Returns the repo name from overview meta. */
export function repoName(pack: OnboardingPack): string {
  return pack.overview.repo.name;
}
