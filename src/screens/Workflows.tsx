import { useEffect, useRef, useState } from "react";
import type { WorkflowId } from "@/src/types/pack";
import { getPack } from "@/src/lib/pack";
import { useProgress } from "@/src/lib/progress";
import { confidenceOf, isVerified } from "@/src/lib/evidence";
import { CodeEvidence, FileReference, useEvidence } from "@/src/components/Evidence";
import {
  ConfidenceBadge,
  GhostButton,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  StatusIndicator,
  Tag,
} from "@/src/components/ui";
import { IconKey } from "@/src/components/Icons";
import { BobTour } from "@/src/components/Bob";

const pack = getPack();
const required = pack.quiz.readiness.requiredWorkflowIds;
// Follow the reading order: foundations first, the most complex journey last
const ORDERED = [...pack.workflows.workflows].sort((a, b) => {
  const ia = required.indexOf(a.id);
  const ib = required.indexOf(b.id);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});
type Workflow = (typeof ORDERED)[number];

const ACTOR_LABEL: Record<Workflow["actor"], string> = {
  visitor: "Visitor",
  customer: "Customer",
  seller: "Seller",
  developer: "Developer",
};

// ---------------------------------------------------------------------------
// WorkflowStepper
// ---------------------------------------------------------------------------

function WorkflowStepper({
  wf,
  active,
  visited,
  onSelect,
}: {
  wf: Workflow;
  active: number;
  visited: Set<number>;
  onSelect: (order: number) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const move = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!move) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(wf.steps.length - 1, i + move));
    refs.current[next]?.focus();
    onSelect(wf.steps[next].order);
  };
  return (
    <ol className="stepper" aria-label={`${wf.name} steps`}>
      {wf.steps.map((s, i) => {
        const isActive = s.order === active;
        const seen = visited.has(s.order);
        return (
          <li key={s.order} className={`stepper-item ${isActive ? "is-active" : ""} ${seen ? "is-seen" : ""}`}>
            <button
              ref={(el) => (refs.current[i] = el)}
              className="stepper-btn"
              onClick={() => onSelect(s.order)}
              onKeyDown={(e) => onKeyDown(e, i)}
              aria-current={isActive ? "step" : undefined}
            >
              <span className="stepper-node">
                <StatusIndicator status={isActive ? "current" : seen ? "done" : "todo"} size={24} />
              </span>
              <span className="stepper-body">
                <span className="stepper-num mono">STEP {String(s.order).padStart(2, "0")}</span>
                <span className="stepper-text">{s.text}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Step detail
// ---------------------------------------------------------------------------

function StepDetail({ wf, order, onSelect }: { wf: Workflow; order: number; onSelect: (o: number) => void }) {
  const { open } = useEvidence();
  const idx = wf.steps.findIndex((s) => s.order === order);
  const step = wf.steps[idx];
  const prev = wf.steps[idx - 1];
  const next = wf.steps[idx + 1];
  const files = [...new Set(step.evidence.map((e) => e.path))];
  const verified = step.evidence.filter(isVerified).length;

  return (
    <article className="step-detail" key={`${wf.id}-${order}`} aria-live="polite">
      <div className="step-detail-head">
        <span className="eyebrow">
          Step {step.order} of {wf.steps.length}
        </span>
        <ConfidenceBadge level={confidenceOf(wf.basis, step.evidence)} basis={wf.basis} citations={verified} />
      </div>
      <h2 className="step-detail-title">{step.text}</h2>

      <div className="step-grid">
        <section className="nd-section">
          <h3 className="nd-label">Files involved</h3>
          <div className="file-refs">
            {files.map((f) => (
              <FileReference key={f} path={f} />
            ))}
          </div>
        </section>
        <section className="nd-section">
          <h3 className="nd-label">Dependencies</h3>
          {wf.externalServices.length ? (
            <div className="tag-row">
              {wf.externalServices.map((s) => (
                <Tag key={s} tone="info">
                  {s}
                </Tag>
              ))}
            </div>
          ) : (
            <p className="nd-text dim">No external services in this workflow.</p>
          )}
        </section>
      </div>

      <section className="nd-section">
        <h3 className="nd-label">
          Evidence <span className="nd-count">{step.evidence.length}</span>
        </h3>
        <div className="ev-list">
          {step.evidence.map((ev, i) => (
            <CodeEvidence key={i} ev={ev} />
          ))}
        </div>
      </section>

      <div className="step-nav">
        <SecondaryButton disabled={!prev} onClick={() => prev && onSelect(prev.order)}>
          ← Previous
        </SecondaryButton>
        <GhostButton
          onClick={() =>
            open({
              kind: "claim",
              context: `Workflow · ${wf.name} · step ${step.order}`,
              claim: step.text,
              basis: wf.basis,
              evidence: step.evidence,
            })
          }
        >
          Open in evidence panel
        </GhostButton>
        <PrimaryButton arrow disabled={!next} onClick={() => next && onSelect(next.order)}>
          {next ? "Next step" : "End of workflow"}
        </PrimaryButton>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function WorkflowsScreen({
  params,
  navigate,
}: {
  params: string[];
  navigate: (to: string) => void;
}) {
  const { progress, dispatch } = useProgress();
  const [visitedByWf, setVisited] = useState<Record<string, number[]>>({});

  const firstUntraced = ORDERED.find((w) => !progress.completedWorkflows.includes(w.id)) ?? ORDERED[0];
  const wf = ORDERED.find((w) => w.id === params[0]) ?? firstUntraced;
  const order = Number(params[1]) || wf.steps[0].order;
  const traced = progress.completedWorkflows.includes(wf.id);

  useEffect(() => {
    setVisited((v) => {
      const seen = v[wf.id] ?? [];
      return seen.includes(order) ? v : { ...v, [wf.id]: [...seen, order] };
    });
  }, [wf.id, order]);

  const visited = new Set(traced ? wf.steps.map((s) => s.order) : visitedByWf[wf.id] ?? []);
  const allVisited = wf.steps.every((s) => visited.has(s.order));
  const tracedCount = required.filter((id) => progress.completedWorkflows.includes(id)).length;

  const select = (id: WorkflowId, step?: number) => navigate(`workflows/${id}${step ? `/${step}` : ""}`);

  const markTraced = () => {
    dispatch({ type: "SET_WORKFLOW", workflowId: wf.id, traced: true });
    const next = ORDERED.find((w) => w.id !== wf.id && !progress.completedWorkflows.includes(w.id));
    if (next) select(next.id);
  };

  return (
    <div className="workflows">
      <ScreenHeader
        eyebrow="02 Trace · Workflows"
        title="Trace the journeys that matter"
        lede={`Follow each workflow step by step. Walk every step to mark it traced — all ${required.length} count toward your readiness.`}
        aside={
          <div className="header-progress">
            <StatusIndicator
              status={tracedCount === required.length ? "done" : tracedCount > 0 ? "current" : "todo"}
              size={20}
            />
            <span>
              <strong className="mono">
                {tracedCount}/{required.length}
              </strong>{" "}
              workflows traced
            </span>
          </div>
        }
      />

      <div className="wf-tabs" role="tablist" aria-label="Workflows">
        {ORDERED.map((w) => {
          const done = progress.completedWorkflows.includes(w.id);
          const isSel = w.id === wf.id;
          return (
            <button
              key={w.id}
              role="tab"
              aria-selected={isSel}
              className={`wf-tab ${isSel ? "wf-tab--active" : ""}`}
              onClick={() => select(w.id)}
            >
              <StatusIndicator status={done ? "done" : isSel ? "current" : "todo"} size={16} />
              <span className="wf-tab-text">
                <span className="wf-tab-name">{w.name}</span>
                <span className="wf-tab-meta">
                  {ACTOR_LABEL[w.actor]} · {w.steps.length} steps
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="wf-head" aria-labelledby="wf-title">
        <div className="wf-head-main">
          <h2 id="wf-title" className="wf-title">
            {wf.name}
          </h2>
          <p className="wf-summary">{wf.summary}</p>
          <div className="tag-row">
            <Tag tone="neutral">ACTOR · {ACTOR_LABEL[wf.actor].toUpperCase()}</Tag>
            {wf.externalServices.map((s) => (
              <Tag key={s} tone="info">
                {s}
              </Tag>
            ))}
            {wf.needsSecretsToRun ? (
              <Tag tone="review" title="Running this flow locally requires real credentials">
                NEEDS SECRETS TO RUN
              </Tag>
            ) : (
              <Tag tone="verified">RUNS WITHOUT SECRETS</Tag>
            )}
          </div>
        </div>
        <div className="wf-head-aside">
          <div className="wf-rail" aria-label={`${visited.size} of ${wf.steps.length} steps walked`}>
            {wf.steps.map((s) => (
              <button
                key={s.order}
                className={`wf-rail-dot ${visited.has(s.order) ? "is-seen" : ""} ${s.order === order ? "is-active" : ""}`}
                onClick={() => select(wf.id, s.order)}
                aria-label={`Go to step ${s.order}`}
              />
            ))}
          </div>
          {traced ? (
            <div className="wf-traced">
              <Tag tone="verified">TRACED</Tag>
              <GhostButton onClick={() => dispatch({ type: "SET_WORKFLOW", workflowId: wf.id, traced: false })}>
                Undo
              </GhostButton>
            </div>
          ) : (
            <PrimaryButton
              disabled={!allVisited}
              onClick={markTraced}
              title={allVisited ? undefined : "Walk every step first"}
            >
              {allVisited ? "✓ Mark workflow traced" : `${visited.size}/${wf.steps.length} steps walked`}
            </PrimaryButton>
          )}
        </div>
      </section>

      <BobTour
        workflowId={wf.id}
        name={wf.name}
        steps={wf.steps}
        order={order}
        onSelect={(o) => select(wf.id, o)}
      />

      <div className="wf-layout">
        <WorkflowStepper wf={wf} active={order} visited={visited} onSelect={(o) => select(wf.id, o)} />
        <div className="wf-detail-col">
          <StepDetail wf={wf} order={order} onSelect={(o) => select(wf.id, o)} />
          {wf.needsSecretsToRun && (
            <aside className="risk-note">
              <IconKey size={16} />
              <div>
                <strong>Potential risk · environment</strong>
                <p>
                  This workflow calls {wf.externalServices.join(", ") || "external services"} and cannot run end-to-end
                  without real credentials. Read it rather than execute it on day one.
                </p>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
