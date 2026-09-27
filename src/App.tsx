import { useState } from "react";
import { useHashRoute } from "@/src/lib/router";
import type { AppView } from "@/src/lib/router";
import type { ParsedRepo } from "@/src/lib/repository";
import { ProgressProvider } from "@/src/lib/progress";
import { EvidenceProvider } from "@/src/components/Evidence";
import { AppShell } from "@/src/components/AppShell";
import RepoEntryScreen from "@/src/screens/RepoEntry";
import UnsupportedScreen from "@/src/screens/Unsupported";
import OverviewScreen from "@/src/screens/Overview";
import ArchitectureScreen from "@/src/screens/Architecture";
import WorkflowsScreen from "@/src/screens/Workflows";
import LearnScreen from "@/src/screens/Learn";
import FirstTaskScreen from "@/src/screens/FirstTask";
import EvidenceLedgerScreen from "@/src/screens/EvidenceLedger";
import SettingsScreen from "@/src/screens/Settings";
import "./index.css";

export default function App() {
  const [appView, setAppView] = useState<AppView>("repo-entry");
  const [selectedRepo, setSelectedRepo] = useState<ParsedRepo | null>(null);

  const [route, navigate] = useHashRoute();
  const { screen, params } = route;

  // ---------------------------------------------------------------------------
  // Entry-flow handlers
  // ---------------------------------------------------------------------------

  function handleSupported(repo: ParsedRepo) {
    setSelectedRepo(repo);
    setAppView("onboarding");
    // Navigate to the overview to start the onboarding journey.
    navigate("overview");
  }

  function handleUnsupported(repo: ParsedRepo) {
    setSelectedRepo(repo);
    setAppView("unsupported");
  }

  function handleTryAnother() {
    setSelectedRepo(null);
    setAppView("repo-entry");
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (appView === "repo-entry") {
    return (
      <RepoEntryScreen
        onSupported={handleSupported}
        onUnsupported={handleUnsupported}
      />
    );
  }

  if (appView === "unsupported" && selectedRepo) {
    return (
      <UnsupportedScreen repo={selectedRepo} onTryAnother={handleTryAnother} />
    );
  }

  // appView === "onboarding"
  return (
    <ProgressProvider>
      <EvidenceProvider>
        <AppShell
          screen={screen}
          navigate={navigate}
          onAnalyzeAnother={handleTryAnother}
        >
          {screen === "overview" && <OverviewScreen navigate={navigate} />}
          {screen === "architecture" && (
            <ArchitectureScreen layerId={params[0]} navigate={navigate} />
          )}
          {screen === "workflows" && (
            <WorkflowsScreen params={params} navigate={navigate} />
          )}
          {screen === "learn" && (
            <LearnScreen stepId={params[0]} navigate={navigate} />
          )}
          {screen === "task" && <FirstTaskScreen navigate={navigate} />}
          {screen === "evidence" && <EvidenceLedgerScreen />}
          {screen === "settings" && <SettingsScreen />}
        </AppShell>
      </EvidenceProvider>
    </ProgressProvider>
  );
}
