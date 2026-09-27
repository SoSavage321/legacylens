import { useCallback, useEffect, useState } from "react";

export type Screen =
  | "overview"
  | "architecture"
  | "workflows"
  | "learn"
  | "task"
  | "evidence"
  | "settings";

const SCREENS: Screen[] = [
  "overview",
  "architecture",
  "workflows",
  "learn",
  "task",
  "evidence",
  "settings",
];

export interface Route {
  screen: Screen;
  /** Extra path segments, e.g. workflows/checkout_payment/3 → ["checkout_payment", "3"] */
  params: string[];
}

function parse(hash: string): Route {
  const [head, ...params] = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const screen = SCREENS.includes(head as Screen) ? (head as Screen) : "overview";
  return { screen, params: params.map(decodeURIComponent) };
}

/** Minimal hash router: keeps the current screen across reloads and supports back/forward. */
export function useHashRoute(): [Route, (to: string) => void] {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((to: string) => {
    const next = `#/${to}`;
    if (window.location.hash === next) return;
    window.location.hash = next;
  }, []);

  return [route, navigate];
}

// ---------------------------------------------------------------------------
// App-level view state (above the hash router)
// ---------------------------------------------------------------------------

/**
 * The top-level view state controls whether the user sees:
 *   "repo-entry"   — the repository input / landing screen
 *   "unsupported"  — the honest "no pack for this repo" screen
 *   "onboarding"   — the existing hash-routed onboarding experience
 */
export type AppView = "repo-entry" | "unsupported" | "onboarding";
