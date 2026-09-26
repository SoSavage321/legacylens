import { useState } from "react";
import { getPack, shortCommit, repoName } from "@/src/lib/pack";
import OverviewScreen from "@/src/screens/Overview";
import ArchitectureScreen from "@/src/screens/Architecture";
import LearnScreen from "@/src/screens/Learn";
import FirstTaskScreen from "@/src/screens/FirstTask";
import "./index.css";

type Tab = "overview" | "architecture" | "learn" | "firsttask";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "learn", label: "Learn" },
  { id: "firsttask", label: "First Task" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const pack = getPack();
  const commit = shortCommit(pack);
  const repo = repoName(pack);
  const isMock = pack.overview.meta.mock;

  return (
    <div className="app">
      {isMock && (
        <div className="mock-banner" role="alert">
          MOCK DATA
        </div>
      )}

      <header className="app-header">
        <span className="app-title">
          LegacyLens
          <span className="app-title-sep"> · </span>
          <span className="app-title-repo">{repo}</span>
          <span className="app-title-sep"> @ </span>
          <code className="app-title-commit">{commit}</code>
        </span>
      </header>

      <nav className="tab-nav" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab-btn${activeTab === tab.id ? " tab-btn--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {activeTab === "overview" && <OverviewScreen overview={pack.overview} />}
        {activeTab === "architecture" && <ArchitectureScreen architecture={pack.architecture} />}
        {activeTab === "learn" && <LearnScreen />}
        {activeTab === "firsttask" && <FirstTaskScreen tasks={pack.tasks} />}
      </main>
    </div>
  );
}
