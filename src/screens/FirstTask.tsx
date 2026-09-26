import { useState } from "react";
import type { Tasks } from "@/src/types/pack";

interface Props {
  tasks: Tasks;
}

type Candidate = Tasks["candidates"][number];
type ValidationRow = Tasks["blastRadius"]["validation"][number];

const STRIP_STEPS = ["Plan", "Code", "Validate", "Review", "Commit", "PR"] as const;

function RiskBadge({ risk }: { risk: Candidate["risk"] }) {
  return (
    <span className={`badge ft-risk ft-risk--${risk}`}>
      {risk.charAt(0).toUpperCase() + risk.slice(1)}
    </span>
  );
}

function DecisionBadge({ decision }: { decision: Candidate["decision"] }) {
  return (
    <span className={`badge ft-decision ft-decision--${decision}`}>
      {decision === "selected" ? "Selected" : "Rejected"}
    </span>
  );
}

function ValidationResult({ result }: { result: ValidationRow["result"] }) {
  if (result === "not_run") return <span className="ft-result ft-result--not_run">Not run</span>;
  if (result === "pass") return <span className="ft-result ft-result--pass">Pass</span>;
  if (result === "fail_env") return <span className="ft-result ft-result--fail_env">Fail (env)</span>;
  return <span className="ft-result ft-result--fail_code">Fail (code)</span>;
}

function Strip() {
  return (
    <div className="ft-strip" role="list" aria-label="Task workflow">
      {STRIP_STEPS.map((step, i) => (
        <div key={step} className="ft-strip-item" role="listitem">
          <span className="ft-strip-step">{step}</span>
          {i < STRIP_STEPS.length - 1 && <span className="ft-strip-arrow" aria-hidden>›</span>}
        </div>
      ))}
    </div>
  );
}

function CandidatesTable({
  candidates,
  selectedId,
}: {
  candidates: Candidate[];
  selectedId: string;
}) {
  return (
    <div className="ft-table-wrap">
      <table className="ft-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Risk</th>
            <th>Decision</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr
              key={c.id}
              className={c.id === selectedId ? "ft-row--selected" : undefined}
            >
              <td className="ft-cell-title">{c.title}</td>
              <td><RiskBadge risk={c.risk} /></td>
              <td><DecisionBadge decision={c.decision} /></td>
              <td className="ft-cell-reason">{c.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlastRadiusSection({ tasks }: { tasks: Tasks }) {
  const br = tasks.blastRadius;
  const selected = tasks.candidates.find((c) => c.id === tasks.selectedId);

  return (
    <section className="ft-section">
      <h3 className="section-title">Blast Radius — {selected?.title}</h3>

      <div className="ft-subsection">
        <div className="ft-sub-label">Changed files</div>
        <ul className="arch-path-list">
          {br.changedFiles.map((f) => (
            <li key={f} className="arch-path-item"><code>{f}</code></li>
          ))}
        </ul>
      </div>

      {br.directDependents.length > 0 && (
        <div className="ft-subsection">
          <div className="ft-sub-label">Direct dependents</div>
          <ul className="arch-path-list">
            {br.directDependents.map((d, i) => (
              <li key={i} className="arch-path-item">
                <code>{d.path}</code>
                {d.note && <span className="ft-dep-note"> — {d.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {br.risks.length > 0 && (
        <div className="ft-subsection">
          <div className="ft-sub-label">Risks</div>
          <ul className="claim-list">
            {br.risks.map((r, i) => (
              <li key={i} className="claim-item">
                <span className="claim-text">{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ValidationTable({ rows }: { rows: ValidationRow[] }) {
  const [openLog, setOpenLog] = useState<number | null>(null);

  return (
    <section className="ft-section">
      <h3 className="section-title">Validation</h3>
      <div className="ft-table-wrap">
        <table className="ft-table">
          <thead>
            <tr>
              <th>Command</th>
              <th>Env</th>
              <th>Expected</th>
              <th>Result</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <>
                <tr key={i} className={row.result === "fail_env" ? "ft-row--env-fail" : undefined}>
                  <td><code className="ft-code">{row.command}</code></td>
                  <td>{row.env}</td>
                  <td>{row.expected}</td>
                  <td><ValidationResult result={row.result} /></td>
                  <td>
                    <button
                      className="ft-log-btn"
                      onClick={() => setOpenLog(openLog === i ? null : i)}
                      aria-expanded={openLog === i}
                    >
                      {openLog === i ? "Hide log" : "Log"}
                    </button>
                  </td>
                </tr>
                {row.result === "fail_env" && (
                  <tr key={`${i}-env-note`} className="ft-row--env-note">
                    <td colSpan={5} className="ft-env-note">
                      Environment limit, not a code failure
                    </td>
                  </tr>
                )}
                {openLog === i && (
                  <tr key={`${i}-log`}>
                    <td colSpan={5}>
                      <pre className="ft-log">{row.log}</pre>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RollbackSection({ rollback }: { rollback: string }) {
  return (
    <section className="ft-section">
      <h3 className="section-title">Rollback</h3>
      <p className="ft-rollback">{rollback}</p>
    </section>
  );
}

export default function FirstTaskScreen({ tasks }: Props) {
  return (
    <div className="ft-screen">
      <Strip />

      <section className="ft-section">
        <h3 className="section-title">Candidates</h3>
        <CandidatesTable candidates={tasks.candidates} selectedId={tasks.selectedId} />
      </section>

      <BlastRadiusSection tasks={tasks} />

      <ValidationTable rows={tasks.blastRadius.validation} />

      <RollbackSection rollback={tasks.blastRadius.rollback} />
    </div>
  );
}
