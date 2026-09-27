import { useEffect, useMemo, useState } from "react";
import { getPack } from "@/src/lib/pack";
import { useProgress } from "@/src/lib/progress";
import { confidenceOf, isVerified } from "@/src/lib/evidence";
import { CodeEvidence, EvidenceButton, FileReference, useEvidence } from "@/src/components/Evidence";
import {
  ConfidenceBadge,
  EmptyState,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  StatusIndicator,
  Tag,
} from "@/src/components/ui";
import { IconArchitecture, IconCheck } from "@/src/components/Icons";

const pack = getPack();
const { layers, edges } = pack.architecture;
type Layer = (typeof layers)[number];
type Edge = (typeof edges)[number];

// Canvas is a 1000 × 620 coordinate space; the container keeps that aspect ratio.
// Positions are node-circle centres; each label sits below its circle.
const W = 1000;
const H = 620;

const POSITIONS: Record<string, [number, number]> = {
  content: [150, 90],
  ui_routes: [500, 90],
  server_actions: [180, 330],
  data: [500, 350],
  auth: [840, 260],
  external_services: [780, 500],
};

const LAYER_TYPE: Record<string, string> = {
  ui_routes: "Presentation",
  server_actions: "Mutations",
  data: "Persistence",
  auth: "Security",
  external_services: "Integrations",
  content: "Content pipeline",
};

function positionOf(id: string, index: number): [number, number] {
  if (POSITIONS[id]) return POSITIONS[id];
  // Fallback for layers the hand-tuned map doesn't know about: place on an ellipse
  const a = (index / layers.length) * Math.PI * 2;
  return [W / 2 + Math.cos(a) * 360, H / 2 + Math.sin(a) * 200];
}

const layerName = (id: string) => layers.find((l) => l.id === id)?.name ?? id;

function edgePath(e: Edge): string {
  const [x1, y1] = positionOf(e.from, layers.findIndex((l) => l.id === e.from));
  const [x2, y2] = positionOf(e.to, layers.findIndex((l) => l.id === e.to));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const inset = 46; // keep the line clear of the node circles
  const sx = x1 + ux * inset;
  const sy = y1 + uy * inset;
  const ex = x2 - ux * (inset + 6);
  const ey = y2 - uy * (inset + 6);
  // gentle curve: control point offset perpendicular to the line
  const bend = 26;
  const cx = (sx + ex) / 2 - uy * bend;
  const cy = (sy + ey) / 2 + ux * bend;
  return `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
}

function relationsOf(id: string) {
  return edges.filter((e) => e.from === id || e.to === id);
}

// ---------------------------------------------------------------------------
// ArchitectureGraph
// ---------------------------------------------------------------------------

function ArchitectureGraph({
  selected,
  explored,
  onSelect,
}: {
  selected: string | null;
  explored: string[];
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const focus = selected ?? hovered;
  const paths = useMemo(() => edges.map(edgePath), []);

  return (
    <div className="graph-scroll">
      <div className={`graph ${focus ? "graph--focused" : ""}`} style={{ aspectRatio: `${W} / ${H}` }}>
        <svg className="graph-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" className="graph-grid-line" />
            </pattern>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" className="graph-arrow" />
            </marker>
            <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" className="graph-arrow graph-arrow--active" />
            </marker>
          </defs>
          <rect width={W} height={H} fill="url(#grid)" />
          {edges.map((e, i) => {
            const active = focus !== null && (e.from === focus || e.to === focus);
            return (
              <g key={i} className={`edge ${active ? "edge--active" : ""} ${e.basis === "inferred" ? "edge--inferred" : ""}`}>
                <path d={paths[i]} className="edge-base" markerEnd="url(#arrow)" />
                {active && (
                  <path
                    // key on focus so the connect animation replays each time a node is selected
                    key={focus}
                    d={paths[i]}
                    pathLength={1}
                    className="edge-live"
                    markerEnd="url(#arrow-active)"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {layers.map((l, i) => {
          const [x, y] = positionOf(l.id, i);
          const rel = relationsOf(l.id).length;
          const isSel = selected === l.id;
          const isRelated =
            focus !== null && focus !== l.id && relationsOf(focus).some((e) => e.from === l.id || e.to === l.id);
          const dim = focus !== null && focus !== l.id && !isRelated;
          const level = confidenceOf("observed", l.evidence);
          return (
            <button
              key={l.id}
              className={`anode ${isSel ? "anode--selected" : ""} ${isRelated ? "anode--related" : ""} ${dim ? "anode--dim" : ""}`}
              style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
              onClick={() => onSelect(l.id)}
              onMouseEnter={() => setHovered(l.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(l.id)}
              onBlur={() => setHovered(null)}
              aria-pressed={isSel}
              aria-label={`${l.name}, ${LAYER_TYPE[l.id] ?? "layer"}, ${rel} relationships, ${level} confidence${
                explored.includes(l.id) ? ", inspected" : ""
              }`}
            >
              <span className="anode-circle">
                <span className="anode-count">{rel}</span>
                {explored.includes(l.id) && (
                  <span className="anode-seen" aria-hidden="true">
                    <IconCheck size={10} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="anode-text">
                <span className="anode-name">{l.name}</span>
                <span className="anode-type">
                  {LAYER_TYPE[l.id] ?? "Layer"} · <span className={`anode-conf anode-conf--${level}`}>{level}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node detail
// ---------------------------------------------------------------------------

function RelationRow({
  e,
  dir,
  onSelect,
  showFrom,
}: {
  e: Edge;
  dir: "out" | "in";
  onSelect: (id: string) => void;
  showFrom?: boolean;
}) {
  const other = dir === "out" ? e.to : e.from;
  return (
    <li className="rel">
      {showFrom && (
        <button className="rel-target rel-from" onClick={() => onSelect(e.from)}>
          {layerName(e.from)}
        </button>
      )}
      <span className="rel-dir" aria-label={dir === "out" ? "depends on" : "used by"}>
        {dir === "out" ? "→" : "←"}
      </span>
      <div className="rel-main">
        <button className="rel-target" onClick={() => onSelect(other)}>
          {layerName(other)}
        </button>
        <span className="rel-label">{e.label}</span>
      </div>
      <EvidenceButton
        label={e.basis === "observed" ? "Observed" : "Inferred"}
        req={{
          kind: "claim",
          context: `Architecture · ${layerName(e.from)} → ${layerName(e.to)}`,
          claim: `${layerName(e.from)} ${e.label}.`,
          basis: e.basis,
          evidence: e.evidence,
        }}
      />
    </li>
  );
}

function NodeDetail({ layer, onSelect }: { layer: Layer; onSelect: (id: string) => void }) {
  const { open } = useEvidence();
  const outgoing = edges.filter((e) => e.from === layer.id);
  const incoming = edges.filter((e) => e.to === layer.id);
  const verified = layer.evidence.filter(isVerified).length;
  const idx = layers.findIndex((l) => l.id === layer.id);
  const next = layers[(idx + 1) % layers.length];
  const claimReq = {
    kind: "claim" as const,
    context: `Architecture · ${layer.name}`,
    claim: layer.summary,
    evidence: layer.evidence,
    why:
      outgoing.length + incoming.length > 0
        ? `${outgoing.length + incoming.length} observed relationships connect this layer to the rest of the system.`
        : undefined,
  };

  return (
    <div className="node-detail" key={layer.id}>
      <div className="eyebrow">{LAYER_TYPE[layer.id] ?? "Layer"}</div>
      <h2 className="node-detail-title">{layer.name}</h2>
      <div className="node-detail-meta">
        <ConfidenceBadge level={confidenceOf("observed", layer.evidence)} citations={verified} />
        <span className="dim mono">{outgoing.length + incoming.length} relationships</span>
      </div>

      <section className="nd-section">
        <h3 className="nd-label">What we found</h3>
        <p className="nd-text">{layer.summary}</p>
      </section>

      <section className="nd-section">
        <h3 className="nd-label">Why we think this</h3>
        {outgoing.length + incoming.length === 0 ? (
          <p className="nd-text dim">No relationships recorded for this layer.</p>
        ) : (
          <ul className="rel-list">
            {outgoing.map((e, i) => (
              <RelationRow key={`o${i}`} e={e} dir="out" onSelect={onSelect} />
            ))}
            {incoming.map((e, i) => (
              <RelationRow key={`i${i}`} e={e} dir="in" onSelect={onSelect} />
            ))}
          </ul>
        )}
      </section>

      <section className="nd-section">
        <h3 className="nd-label">
          Evidence <span className="nd-count">{layer.evidence.length}</span>
        </h3>
        <div className="ev-list">
          {layer.evidence.slice(0, 2).map((ev, i) => (
            <CodeEvidence key={i} ev={ev} />
          ))}
        </div>
      </section>

      <section className="nd-section">
        <h3 className="nd-label">Related files</h3>
        <div className="file-refs">
          {layer.paths.map((p) => (
            <FileReference key={p} path={p} />
          ))}
        </div>
      </section>

      <div className="nd-actions">
        <PrimaryButton onClick={() => open(claimReq)}>View all evidence</PrimaryButton>
        <SecondaryButton arrow onClick={() => onSelect(next.id)}>
          {next.name}
        </SecondaryButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ArchitectureScreen({
  layerId,
  navigate,
}: {
  layerId?: string;
  navigate: (to: string) => void;
}) {
  const { progress, dispatch } = useProgress();
  const selected = layers.find((l) => l.id === layerId) ?? null;

  useEffect(() => {
    if (selected) dispatch({ type: "EXPLORE_LAYER", layerId: selected.id });
  }, [selected, dispatch]);

  const select = (id: string) => navigate(`architecture/${id}`);
  const inspected = layers.filter((l) => progress.exploredLayers.includes(l.id)).length;
  const allSeen = inspected === layers.length;

  return (
    <div className="architecture">
      <ScreenHeader
        eyebrow="01 Understand · Architecture"
        title="A map of the system"
        lede="Six layers, and the observed dependencies between them. Select a layer to see what we found, why we think it, and the source that proves it."
        aside={
          <div className="header-progress">
            <StatusIndicator status={allSeen ? "done" : inspected > 0 ? "current" : "todo"} size={20} />
            <span>
              <strong className="mono">
                {inspected}/{layers.length}
              </strong>{" "}
              layers inspected
            </span>
            {allSeen && (
              <PrimaryButton size="sm" arrow onClick={() => navigate("workflows")}>
                Trace workflows
              </PrimaryButton>
            )}
          </div>
        }
      />

      <div className="arch-layout">
        <div className="arch-canvas-wrap">
          <ArchitectureGraph selected={selected?.id ?? null} explored={progress.exploredLayers} onSelect={select} />
          <div className="graph-legend" aria-hidden="true">
            <span>
              <i className="lg-node" /> Layer · number = relationships
            </span>
            <span>
              <i className="lg-edge" /> Observed dependency
            </span>
            <span>
              <i className="lg-seen">
                <IconCheck size={9} strokeWidth={3} />
              </i>{" "}
              Inspected
            </span>
          </div>
        </div>

        <aside className="arch-panel" aria-live="polite">
          {selected ? (
            <NodeDetail layer={selected} onSelect={select} />
          ) : (
            <EmptyState
              icon={<IconArchitecture size={22} />}
              title="Architecture analysis hasn't been explored yet."
              body={
                <>
                  Every request enters through <strong>UI / Routes</strong>. Start there and follow the arrows outward —
                  each one links to the code that proves it.
                </>
              }
              action={
                <PrimaryButton arrow onClick={() => select("ui_routes")}>
                  Explore architecture
                </PrimaryButton>
              }
            />
          )}
        </aside>
      </div>

      <section className="ov-section">
        <div className="section-head">
          <h2 className="section-title">All relationships</h2>
          <span className="section-hint">
            <Tag tone="verified">OBSERVED</Tag> {edges.filter((e) => e.basis === "observed").length} of {edges.length}
          </span>
        </div>
        <ul className="rel-list rel-list--table">
          {edges.map((e, i) => (
            <RelationRow key={i} e={e} dir="out" onSelect={select} showFrom />
          ))}
        </ul>
      </section>
    </div>
  );
}
