import { useHashRoute } from "@/src/lib/router";
import { ProgressProvider } from "@/src/lib/progress";
import { EvidenceProvider } from "@/src/components/Evidence";
import { AppShell } from "@/src/components/AppShell";
import OverviewScreen from "@/src/screens/Overview";
import ArchitectureScreen from "@/src/screens/Architecture";
import WorkflowsScreen from "@/src/screens/Workflows";
import LearnScreen from "@/src/screens/Learn";
import FirstTaskScreen from "@/src/screens/FirstTask";
import EvidenceLedgerScreen from "@/src/screens/EvidenceLedger";
import SettingsScreen from "@/src/screens/Settings";
import "./index.css";

export default function App() {
  const [route, navigate] = useHashRoute();
  const { screen, params } = route;

  return (
    <ProgressProvider>
      <EvidenceProvider>
        <AppShell screen={screen} navigate={navigate}>
          {screen === "overview" && <OverviewScreen navigate={navigate} />}
          {screen === "architecture" && <ArchitectureScreen layerId={params[0]} navigate={navigate} />}
          {screen === "workflows" && <WorkflowsScreen params={params} navigate={navigate} />}
          {screen === "learn" && <LearnScreen stepId={params[0]} navigate={navigate} />}
          {screen === "task" && <FirstTaskScreen navigate={navigate} />}
          {screen === "evidence" && <EvidenceLedgerScreen />}
          {screen === "settings" && <SettingsScreen />}
        </AppShell>
      </EvidenceProvider>
    </ProgressProvider>
  );
}
