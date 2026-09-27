import { useEffect, useState, type ReactNode } from "react";
import type { Screen } from "../lib/router";
import { useProgress, type Milestone } from "../lib/progress";
import { SHORT_COMMIT } from "../lib/evidence";
import { getPack } from "../lib/pack";
import {
  IconArchitecture,
  IconCommit,
  IconEvidence,
  IconLearn,
  IconLogo,
  IconOverview,
  IconSearch,
  IconSettings,
  IconTask,
  IconWorkflows,
} from "./Icons";
import { ProgressRing, StatusIndicator, type Status } from "./ui";
import { CommandPalette } from "./CommandPalette";

const pack = getPack();

interface NavItem {
  id: Screen;
  label: string;
  icon: ReactNode;
  milestones: Milestone["id"][];
}

const PRIMARY_NAV: NavItem[] = [
  { id: "overview", label: "Overview", icon: <IconOverview />, milestones: ["orient"] },
  { id: "architecture", label: "Architecture", icon: <IconArchitecture />, milestones: ["arch"] },
  { id: "workflows", label: "Workflows", icon: <IconWorkflows />, milestones: ["trace"] },
  { id: "learn", label: "Learn", icon: <IconLearn />, milestones: ["read", "check"] },
  { id: "task", label: "First Task", icon: <IconTask />, milestones: ["task"] },
];

const SECONDARY_NAV: { id: Screen; label: string; icon: ReactNode }[] = [
  { id: "evidence", label: "Evidence", icon: <IconEvidence /> },
  { id: "settings", label: "Settings", icon: <IconSettings /> },
];

const SCREEN_TITLES: Record<Screen, string> = {
  overview: "Overview",
  architecture: "Architecture",
  workflows: "Workflows",
  learn: "Learn",
  task: "First Task",
  evidence: "Evidence",
  settings: "Settings",
};

function navStatus(item: NavItem, milestones: Milestone[]): Status {
  const ms = milestones.filter((m) => item.milestones.includes(m.id));
  if (ms.every((m) => m.status === "done")) return "done";
  if (ms.some((m) => m.status === "current")) return "current";
  if (ms.some((m) => m.status === "locked")) return "locked";
  if (ms.some((m) => m.status === "ready")) return "ready";
  return "todo";
}

export function AppShell({
  screen,
  navigate,
  children,
}: {
  screen: Screen;
  navigate: (to: string) => void;
  children: ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Move focus to the new screen's heading on navigation for keyboard & screen-reader users
  useEffect(() => {
    const main = document.getElementById("main");
    main?.scrollTo({ top: 0 });
    const h1 = main?.querySelector<HTMLElement>("h1");
    if (h1 && document.activeElement?.closest(".sidebar")) {
      h1.setAttribute("tabindex", "-1");
      h1.focus({ preventScroll: true });
    }
  }, [screen]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {pack.overview.meta.mock && (
        <div className="mock-banner" role="alert">
          ! MOCK DATA — this onboarding pack has not been generated from the repository
        </div>
      )}
      <Sidebar screen={screen} navigate={navigate} />
      <TopBar screen={screen} onSearch={() => setPaletteOpen(true)} navigate={navigate} />
      <main id="main" className="main" tabIndex={-1}>
        <div className="main-inner" key={screen}>
          {children}
        </div>
      </main>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} navigate={navigate} />}
    </div>
  );
}

function Sidebar({ screen, navigate }: { screen: Screen; navigate: (to: string) => void }) {
  const { milestones } = useProgress();
  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-brand">
        <IconLogo />
        <span className="sidebar-brand-name">LegacyLens</span>
      </div>

      <div className="sidebar-repo">
        <span className="sidebar-repo-label">Repository</span>
        <span className="sidebar-repo-name">{pack.overview.repo.name.toUpperCase()}</span>
        <span className="sidebar-repo-commit">
          <IconCommit size={12} /> <code>{SHORT_COMMIT}</code>
        </span>
      </div>

      <nav className="sidebar-nav" aria-label="Investigation">
        <span className="sidebar-section">Investigation</span>
        <ul>
          {PRIMARY_NAV.map((item) => {
            const active = screen === item.id;
            const status = navStatus(item, milestones);
            return (
              <li key={item.id}>
                <button
                  className={`nav-item ${active ? "nav-item--active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                  title={item.label}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                  <span className="nav-status">
                    <StatusIndicator status={status} size={16} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav className="sidebar-nav sidebar-nav--bottom" aria-label="Utilities">
        <ul>
          {SECONDARY_NAV.map((item) => {
            const active = screen === item.id;
            return (
              <li key={item.id}>
                <button
                  className={`nav-item ${active ? "nav-item--active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                  title={item.label}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

function TopBar({
  screen,
  onSearch,
  navigate,
}: {
  screen: Screen;
  onSearch: () => void;
  navigate: (to: string) => void;
}) {
  const { readiness } = useProgress();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header className="topbar">
      <div className="topbar-crumbs">
        <span className="topbar-repo">{pack.overview.repo.name}</span>
        <span className="topbar-sep" aria-hidden="true">
          /
        </span>
        <span className="topbar-screen">{SCREEN_TITLES[screen]}</span>
      </div>

      <button className="topbar-search" onClick={onSearch} aria-label="Search files, claims and workflows">
        <IconSearch size={15} />
        <span className="topbar-search-text">Search files, claims, workflows…</span>
        <kbd>{isMac ? "⌘" : "Ctrl"} K</kbd>
      </button>

      <button
        className="understanding"
        onClick={() => navigate("learn")}
        title={`Readiness ${readiness.totalScore}% — first task unlocks at ${readiness.thresholdPercent}%`}
      >
        <ProgressRing value={readiness.totalScore} threshold={readiness.thresholdPercent} size={30} stroke={3} />
        <span className="understanding-text">
          <span className="understanding-value" aria-live="polite">
            {readiness.totalScore}%
          </span>
          <span className="understanding-label">understood</span>
        </span>
      </button>

      <div className="profile" title="Local session — progress is stored in this browser">
        <span className="profile-avatar" aria-hidden="true">
          NC
        </span>
        <span className="profile-text">
          <span className="profile-name">New contributor</span>
          <span className="profile-role">Local session</span>
        </span>
      </div>
    </header>
  );
}
