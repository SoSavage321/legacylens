import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getPack } from "@/src/lib/pack";
import { useProgress } from "@/src/lib/progress";
import { confidenceOf, isVerified } from "@/src/lib/evidence";
import {
  GOALS,
  ROUTES,
  TIERS,
  dependenciesOf,
  dependentsOf,
  readingFor,
  roleOf,
  secretsFor,
  workflowsThrough,
  type WorkflowRoute,
} from "@/src/lib/systemMap";
import { speak, stopSpeaking, useSpeaking } from "@/src/lib/voice";
import { CodeEvidence, EvidenceButton, FileReference, useEvidence } from "@/src/components/Evidence";
import { BobOrb, IconPlay, IconStop, useBob } from "@/src/components/Bob";
import {
  ConfidenceBadge,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  StatusIndicator,
  Tag,
} from "@/src/components/ui";
import { IconArrowRight, IconCheck, IconKey } from "@/src/components/Icons";

const pack = getPack();
const { layers, edges } = pack.architecture;
type Layer = (typeof layers)[number];
type Edge = (typeof edges)[number];
type Mode = "explore" | "flow" | "find";

// Canvas is a 1000 × 620 coordinate space; the container keeps that aspect ratio.
// Rows follow a request: it enters at the top, work happens in the middle, and
// the bottom row is everything outside the codebase.
const W = 1000;
const H = 620;

const POSITIONS: Record<string, [number, number]> = {
  content: [180, TIERS[0].y],
  ui_routes: [500, TIERS[0].y],
  auth: [190, TIERS[1].y],
  server_actions: [500, TIERS[1].y],
  data: [810, TIERS[1].y],
  external_services: [500, TIERS[2].y],
};

function positionOf(id: string): [number, number] {
  if (POSITIONS[id]) return POSITIONS[id];
  // Fallback for layers the hand-tuned map doesn't know about: place on an ellipse
  const index = layers.findIndex((l) => l.id === id);
  const a = (index / layers.length) * Math.PI * 2;
  return [W / 2 + Math.cos(a) * 360, H / 2 + Math.sin(a) * 200];
}

const layerName = (id: string) => layers.find((l) => l.id === id)?.name ?? id;

/** Curved connector between two layer circles, kept clear of both. */
function curve(from: string, to: string, bendSign = 1): string {
  const [x1, y1] = positionOf(from);
  const [x2, y2] = positionOf(to);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const inset = 44;
  const sx = x1 + ux * inset;
  const sy = y1 + uy * inset;
  const ex = x2 - ux * (inset + 6);
  const ey = y2 - uy * (inset + 6);
  const bend = 22 * bendSign;
  const cx = (sx + ex) / 2 - uy * bend;
  const cy = (sy + ey) / 2 + ux * bend;
  return `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
}

/** A packet's route through several layers, as one continuous path. */
function routePath(ids: string[]): string {
  const segs: string[] = [];
  for (let i = 1; i < ids.length; i++) {
    const seg = curve(ids[i - 1], ids[i], -1);
    segs.push(i === 1 ? seg : seg.replace(/^M/, "L"));
  }
  return segs.join(" ");
}

function relationsOf(id: string) {
  return edges.filter((e) => e.from === id || e.to === id);
}

// ---------------------------------------------------------------------------
// Layer glyphs — a picture of each layer's job, so the map reads without labels
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, ReactNode> = {
  ui_routes: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4M3 8h18" />
    </>
  ),
  server_actions: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  data: (
    <>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
      <path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
    </>
  ),
  auth: (
    <>
      <path d="M12 2.5 4.5 5.5v6c0 4.7 3.2 8.4 7.5 10 4.3-1.6 7.5-5.3 7.5-10v-6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  external_services: (
    <>
      <path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.6A3.8 3.8 0 0 1 17.5 18z" />
      <path d="M12 12v5M9.5 14.5 12 17l2.5-2.5" />
    </>
  ),
  content: (
    <>
      <path d="M6 2.5h8.5L19 7v14.5H6z" />
      <path d="M14 2.5V7h5M9 12h7M9 16h7" />
    </>
  ),
};

function LayerGlyph({ id, size = 22 }: { id: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[id] ?? <circle cx="12" cy="12" r="7" />}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// SystemMap — the animated graph
// ---------------------------------------------------------------------------

interface FlowOverlay {
  /** Layers the packet crosses on this step, starting from where it was */
  route: string[];
  /** Path already travelled on earlier steps */
  trail: string[][];
  /** Changes every step so the animation replays */
  key: string;
}

type NodeTone = "active" | "reach" | "goal" | "lean" | "impact";

function SystemMap({
  selected,
  explored,
  onSelect,
  tones,
  edgeTone,
  flow,
}: {
  selected: string | null;
  explored: string[];
  onSelect: (id: string) => void;
  tones?: Record<string, NodeTone>;
  edgeTone?: (e: Edge) => "lean" | "impact" | null;
  flow?: FlowOverlay;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const focus = tones ? null : selected ?? hovered;
  const paths = useMemo(() => edges.map((e) => curve(e.from, e.to)), []);
  const trailRef = useRef<SVGPathElement>(null);
  const packetRef = useRef<SVGGElement>(null);

  const flowPath = flow && flow.route.length > 1 ? routePath(flow.route) : null;
  const hops = flow ? Math.max(1, flow.route.length - 1) : 1;

  // Move the packet along this step's path, easing in and out of each layer
  useEffect(() => {
    const path = trailRef.current;
    const packet = packetRef.current;
    if (!path || !packet) return;
    const total = path.getTotalLength();
    const duration = hops * 900;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const pt = path.getPointAtLength(eased * total);
      packet.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [flow?.key, hops]);

  return (
    <div className="graph-scroll">
      <div
        className={`graph ${focus ? "graph--focused" : ""} ${tones ? "graph--toned" : ""}`}
        style={{ aspectRatio: `${W} / ${H}` }}
      >
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
            <radialGradient id="packet-glow">
              <stop offset="0%" stopColor="#fff" />
              <stop offset="35%" stopColor="#b9a8ff" />
              <stop offset="100%" stopColor="#8b6cff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width={W} height={H} fill="url(#grid)" />

          {/* Tier bands: a request reads top to bottom */}
          {TIERS.map((t, i) => {
            const top = i === 0 ? 0 : (TIERS[i - 1].y + t.y) / 2 + 12;
            const bottom = i === TIERS.length - 1 ? H : (t.y + TIERS[i + 1].y) / 2 + 12;
            return (
              <g key={t.label} className="tier">
                <rect x={0} y={top} width={W} height={bottom - top} className={`tier-band tier-band--${i}`} />
                {i > 0 && <line x1={0} x2={W} y1={top} y2={top} className="tier-line" />}
                <text x={20} y={top + 24} className="tier-label">
                  {String(i + 1).padStart(2, "0")} · {t.label.toUpperCase()}
                </text>
              </g>
            );
          })}

          {edges.map((e, i) => {
            const toned = edgeTone?.(e) ?? null;
            const active = toned !== null || (focus !== null && (e.from === focus || e.to === focus));
            return (
              <g
                key={i}
                className={`edge ${active ? "edge--active" : ""} ${toned ? `edge--${toned}` : ""} ${
                  e.basis === "inferred" ? "edge--inferred" : ""
                }`}
                style={{ animationDelay: `${300 + i * 60}ms` }}
              >
                <path d={paths[i]} className="edge-base" markerEnd="url(#arrow)" />
                {/* Travelling dots show which way calls go */}
                <path d={paths[i]} pathLength={1} className="edge-flow" />
                {active && (
                  <path
                    // key so the connect animation replays each time the focus changes
                    key={`${focus}-${toned}`}
                    d={paths[i]}
                    pathLength={1}
                    className="edge-live"
                    markerEnd="url(#arrow-active)"
                  />
                )}
              </g>
            );
          })}

          {flow && (
            <g className="flow">
              {flow.trail.map((r, i) =>
                r.length > 1 ? <path key={i} d={routePath(r)} className="flow-trail-old" /> : null
              )}
              {flowPath && (
                <g key={`t-${flow.key}`}>
                  <path d={flowPath} pathLength={1} className="flow-trail" style={{ animationDuration: `${hops * 900}ms` }} />
                  {/* Unscaled copy used only to measure where the packet should be */}
                  <path ref={trailRef} d={flowPath} fill="none" stroke="none" />
                </g>
              )}
              {flowPath ? (
                <g key={`p-${flow.key}`} ref={packetRef} className="flow-packet-g">
                  <circle r={16} fill="url(#packet-glow)" />
                  <circle r={5.5} className="flow-packet" />
                </g>
              ) : flow.route[0] ? (
                <circle
                  key={`s-${flow.key}`}
                  cx={positionOf(flow.route[0])[0]}
                  cy={positionOf(flow.route[0])[1]}
                  r={40}
                  className="flow-pulse"
                />
              ) : null}
            </g>
          )}
        </svg>

        {layers.map((l, i) => {
          const [x, y] = positionOf(l.id);
          const rel = relationsOf(l.id).length;
          const isSel = selected === l.id;
          const tone = tones?.[l.id];
          const isRelated =
            focus !== null && focus !== l.id && relationsOf(focus).some((e) => e.from === l.id || e.to === l.id);
          const dim = tones ? !tone : focus !== null && focus !== l.id && !isRelated;
          const role = roleOf(l.id);
          return (
            <button
              key={l.id}
              className={`anode ${isSel ? "anode--selected" : ""} ${isRelated ? "anode--related" : ""} ${
                dim ? "anode--dim" : ""
              } ${tone ? `anode--${tone}` : ""}`}
              style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, animationDelay: `${i * 70}ms` }}
              onClick={() => onSelect(l.id)}
              onMouseEnter={() => setHovered(l.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(l.id)}
              onBlur={() => setHovered(null)}
              aria-pressed={isSel}
              aria-label={`${l.name}: ${role.tag}. ${rel} connections${explored.includes(l.id) ? ", inspected" : ""}`}
            >
              <span className="anode-circle">
                <LayerGlyph id={l.id} />
                {explored.includes(l.id) && (
                  <span className="anode-seen" aria-hidden="true">
                    <IconCheck size={10} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="anode-text">
                <span className="anode-name">{l.name}</span>
                <span className="anode-type">{role.tag}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
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
      <span className="rel-dir" aria-label={dir === "out" ? "calls" : "called by"}>
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

function ImpactBlock({ layerId, onSelect }: { layerId: string; onSelect: (id: string) => void }) {
  const dependents = dependentsOf(layerId);
  const deps = dependenciesOf(layerId);
  return (
    <div className="impact">
      <div className="impact-col impact-col--impact">
        <span className="impact-head">Could break if you change it</span>
        {dependents.length ? (
          dependents.map((e) => (
            <button key={e.from} className="impact-chip" onClick={() => onSelect(e.from)}>
              <LayerGlyph id={e.from} size={14} />
              {layerName(e.from)}
            </button>
          ))
        ) : (
          <span className="impact-none">Nothing depends on this layer.</span>
        )}
      </div>
      <div className="impact-col impact-col--lean">
        <span className="impact-head">Your change will lean on</span>
        {deps.length ? (
          deps.map((e) => (
            <button key={e.to} className="impact-chip" onClick={() => onSelect(e.to)}>
              <LayerGlyph id={e.to} size={14} />
              {layerName(e.to)}
            </button>
          ))
        ) : (
          <span className="impact-none">It calls no other layer.</span>
        )}
      </div>
    </div>
  );
}

function SecretsNote({ layerId }: { layerId: string }) {
  const secrets = secretsFor(layerId);
  if (!secrets.length) {
    return (
      <p className="secrets secrets--none">
        <IconCheck size={14} /> Workflows here run without third-party credentials.
      </p>
    );
  }
  return (
    <p className="secrets">
      <IconKey size={14} />
      <span>
        To run workflows through here you'll need credentials for <strong>{secrets.join(", ")}</strong>. Read before you
        run.
      </span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Explore — one layer, explained for day one
// ---------------------------------------------------------------------------

function NodeDetail({
  layer,
  onSelect,
  onWatch,
}: {
  layer: Layer;
  onSelect: (id: string) => void;
  onWatch: (id: string) => void;
}) {
  const { open } = useEvidence();
  const outgoing = edges.filter((e) => e.from === layer.id);
  const incoming = edges.filter((e) => e.to === layer.id);
  const verified = layer.evidence.filter(isVerified).length;
  const idx = layers.findIndex((l) => l.id === layer.id);
  const next = layers[(idx + 1) % layers.length];
  const role = roleOf(layer.id);
  const through = workflowsThrough(layer.id);
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
      <div className="nd-hero">
        <span className="nd-glyph">
          <LayerGlyph id={layer.id} size={26} />
        </span>
        <div>
          <div className="eyebrow">{role.tag}</div>
          <h2 className="node-detail-title">{layer.name}</h2>
        </div>
      </div>
      <p className="nd-plain">{role.plain}</p>

      <section className="nd-section">
        <h3 className="nd-label">
          What Bob found <ConfidenceBadge level={confidenceOf("observed", layer.evidence)} citations={verified} compact />
        </h3>
        <p className="nd-text">{layer.summary}</p>
      </section>

      <section className="nd-section">
        <h3 className="nd-label">If you change this</h3>
        <ImpactBlock layerId={layer.id} onSelect={onSelect} />
        <SecretsNote layerId={layer.id} />
      </section>

      {through.length > 0 && (
        <section className="nd-section">
          <h3 className="nd-label">Requests that pass through</h3>
          <div className="nd-watch">
            {through.map((r) => (
              <button key={r.id} className="watch-chip" onClick={() => onWatch(r.id)}>
                <IconPlay size={9} /> {r.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="nd-section">
        <h3 className="nd-label">How it connects</h3>
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
        <h3 className="nd-label">Start reading in</h3>
        <div className="file-refs">
          {layer.paths.map((p) => (
            <FileReference key={p} path={p} />
          ))}
        </div>
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

      <div className="nd-actions">
        <PrimaryButton onClick={() => open(claimReq)}>View all evidence</PrimaryButton>
        <SecondaryButton arrow onClick={() => onSelect(next.id)}>
          {next.name}
        </SecondaryButton>
      </div>
    </div>
  );
}

function ExploreIntro({ onSelect, onMode }: { onSelect: (id: string) => void; onMode: (m: Mode) => void }) {
  return (
    <div className="arch-intro">
      <BobOrb size={48} />
      <h2>Here's {pack.overview.repo.name} in one picture.</h2>
      <p>
        Read it top to bottom. Requests enter at <strong>UI / Routes</strong>, the work happens in the middle row, and
        the bottom row is everything outside the codebase. Moving dots show which way calls go.
      </p>
      <div className="arch-intro-actions">
        <button className="arch-intro-card" onClick={() => onMode("flow")}>
          <span className="arch-intro-icon arch-intro-icon--bob">
            <IconPlay size={12} />
          </span>
          <span>
            <strong>Watch a request travel</strong>
            <span>See a real checkout move through the layers, narrated by Bob.</span>
          </span>
        </button>
        <button className="arch-intro-card" onClick={() => onMode("find")}>
          <span className="arch-intro-icon">?</span>
          <span>
            <strong>Where does my change go?</strong>
            <span>Pick what you want to do; Bob lights up where to start and what it touches.</span>
          </span>
        </button>
        <button className="arch-intro-card" onClick={() => onSelect("ui_routes")}>
          <span className="arch-intro-icon">
            <LayerGlyph id="ui_routes" size={14} />
          </span>
          <span>
            <strong>Walk the layers</strong>
            <span>Start at the front door and inspect each layer in turn.</span>
          </span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watch a request — a workflow animated across the map
// ---------------------------------------------------------------------------

function FlowPanel({
  route,
  stepIdx,
  setStepIdx,
  playing,
  setPlaying,
  onPick,
  navigate,
}: {
  route: WorkflowRoute;
  stepIdx: number;
  setStepIdx: (i: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  onPick: (id: string) => void;
  navigate: (to: string) => void;
}) {
  const { voiceOn, setVoiceOn } = useBob();
  const speaking = useSpeaking();
  const stop = route.stops[stepIdx];

  return (
    <div className="flow-panel">
      <div className="flow-pick" role="tablist" aria-label="Choose a request to watch">
        {ROUTES.map((r) => (
          <button
            key={r.id}
            role="tab"
            aria-selected={r.id === route.id}
            className={`flow-pick-btn ${r.id === route.id ? "is-on" : ""}`}
            onClick={() => onPick(r.id)}
          >
            {r.name}
          </button>
        ))}
      </div>

      <div className="flow-stage" key={`${route.id}-${stepIdx}`}>
        <div className="flow-stage-top">
          <span className="eyebrow">
            Step {stepIdx + 1} of {route.stops.length} · {route.actor}
          </span>
          <span className="flow-where">
            {stop.layers.map((id, i) => (
              <span key={id} className="flow-where-item">
                {i > 0 && <IconArrowRight size={11} />}
                <LayerGlyph id={id} size={13} />
                {layerName(id)}
              </span>
            ))}
          </span>
        </div>
        <p className="flow-text">{stop.text}</p>
        <div className="file-refs">
          {stop.files.slice(0, 4).map((f) => (
            <FileReference key={f} path={f} />
          ))}
        </div>
      </div>

      <div className="flow-controls">
        <button
          className="icon-btn"
          disabled={stepIdx === 0}
          onClick={() => {
            setPlaying(false);
            setStepIdx(stepIdx - 1);
          }}
          aria-label="Previous step"
        >
          ←
        </button>
        <button className={`flow-play ${playing ? "is-playing" : ""}`} onClick={() => setPlaying(!playing)}>
          {playing ? <IconStop size={12} /> : <IconPlay size={12} />}
          {playing ? "Pause" : stepIdx === 0 ? "Play" : "Resume"}
        </button>
        <button
          className="icon-btn"
          disabled={stepIdx === route.stops.length - 1}
          onClick={() => {
            setPlaying(false);
            setStepIdx(stepIdx + 1);
          }}
          aria-label="Next step"
        >
          →
        </button>
        <button
          className={`flow-voice ${voiceOn ? "is-on" : ""}`}
          onClick={() => setVoiceOn(!voiceOn)}
          aria-pressed={voiceOn}
          title={voiceOn ? "Bob narrates each step" : "Turn on Bob's narration"}
        >
          <BobOrb size={18} state={speaking ? "speaking" : "idle"} />
          {voiceOn ? "Voice on" : "Voice off"}
        </button>
      </div>

      <ol className="flow-dots" aria-label="Steps">
        {route.stops.map((s, i) => (
          <li key={s.order}>
            <button
              className={`flow-dot ${i === stepIdx ? "is-active" : ""} ${i < stepIdx ? "is-done" : ""}`}
              onClick={() => {
                setPlaying(false);
                setStepIdx(i);
              }}
              aria-label={`Step ${i + 1}`}
            />
          </li>
        ))}
      </ol>

      <div className="flow-foot">
        <span className="dim">Path drawn from the files each step cites.</span>
        <button className="link-btn" onClick={() => navigate(`workflows/${route.id}/${stop.order}`)}>
          Trace this step in detail →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Where does my change go?
// ---------------------------------------------------------------------------

function FinderPanel({
  goalId,
  onGoal,
  onSelect,
  onWatch,
  navigate,
}: {
  goalId: string | undefined;
  onGoal: (id: string) => void;
  onSelect: (id: string) => void;
  onWatch: (id: string) => void;
  navigate: (to: string) => void;
}) {
  const goal = GOALS.find((g) => g.id === goalId);
  const layer = goal && layers.find((l) => l.id === goal.layerId);
  const reading = goal ? readingFor(goal.layerId).slice(0, 3) : [];
  const through = goal ? workflowsThrough(goal.layerId) : [];

  return (
    <div className="finder">
      <h2 className="finder-title">I want to…</h2>
      <div className="finder-goals">
        {GOALS.map((g) => (
          <button key={g.id} className={`finder-goal ${g.id === goalId ? "is-on" : ""}`} onClick={() => onGoal(g.id)}>
            <LayerGlyph id={g.layerId} size={15} />
            {g.label}
          </button>
        ))}
      </div>

      {goal && layer ? (
        <div className="finder-answer" key={goal.id}>
          <div className="finder-start">
            <span className="finder-step">1</span>
            <div>
              <strong>
                Start in{" "}
                <button className="link-btn" onClick={() => onSelect(layer.id)}>
                  {layer.name}
                </button>
              </strong>
              <p className="dim">{roleOf(layer.id).plain}</p>
              <div className="file-refs">
                {layer.paths.map((p) => (
                  <FileReference key={p} path={p} />
                ))}
              </div>
            </div>
          </div>

          <div className="finder-start">
            <span className="finder-step">2</span>
            <div>
              <strong>Check what it touches</strong>
              <ImpactBlock layerId={layer.id} onSelect={onSelect} />
              <SecretsNote layerId={layer.id} />
            </div>
          </div>

          {(reading.length > 0 || through.length > 0) && (
            <div className="finder-start">
              <span className="finder-step">3</span>
              <div>
                <strong>Read or watch before you edit</strong>
                <div className="nd-watch">
                  {reading.map((s) => (
                    <button key={s.id} className="watch-chip watch-chip--read" onClick={() => navigate(`learn/${s.id}`)}>
                      {String(s.order).padStart(2, "0")} {s.title} · {s.minutes} min
                    </button>
                  ))}
                  {through.slice(0, 3).map((r) => (
                    <button key={r.id} className="watch-chip" onClick={() => onWatch(r.id)}>
                      <IconPlay size={9} /> {r.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="finder-hint">Pick a goal. Bob lights up the layer where the change starts and everything it reaches.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "explore", label: "Explore the map", hint: "What each layer does" },
  { id: "flow", label: "Watch a request", hint: "Follow real code paths" },
  { id: "find", label: "Where does my change go?", hint: "Start point and impact" },
];

const DWELL_MS_PER_CHAR = 45;

export default function ArchitectureScreen({
  layerId,
  params = [],
  navigate,
}: {
  layerId?: string;
  params?: string[];
  navigate: (to: string) => void;
}) {
  const { progress, dispatch } = useProgress();
  const { voiceOn } = useBob();

  // Routes: architecture/<layer> · architecture/flow/<workflow> · architecture/find/<goal>
  const mode: Mode = layerId === "flow" ? "flow" : layerId === "find" ? "find" : "explore";
  const selected = mode === "explore" ? layers.find((l) => l.id === layerId) ?? null : null;
  const route = ROUTES.find((r) => r.id === params[1]) ?? ROUTES.find((r) => r.id === "checkout_payment") ?? ROUTES[0];
  const goalId = mode === "find" ? params[1] : undefined;
  const goal = GOALS.find((g) => g.id === goalId);

  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (selected) dispatch({ type: "EXPLORE_LAYER", layerId: selected.id });
  }, [selected, dispatch]);
  useEffect(() => {
    if (goal) dispatch({ type: "EXPLORE_LAYER", layerId: goal.layerId });
  }, [goal, dispatch]);

  // New workflow or leaving flow mode: rewind
  useEffect(() => {
    setStepIdx(0);
    setPlaying(false);
    stopSpeaking();
  }, [route.id, mode]);
  useEffect(() => () => stopSpeaking(), []);

  // Playback: narrate (or dwell) on each step, then advance
  useEffect(() => {
    if (!playing || mode !== "flow") return;
    const stop = route.stops[stepIdx];
    const advance = () => {
      if (stepIdx < route.stops.length - 1) setStepIdx(stepIdx + 1);
      else setPlaying(false);
    };
    if (voiceOn) {
      const intro = stepIdx === 0 ? `Here's what happens in ${route.name}. ` : "";
      speak(`${intro}${stop.text}`, advance);
      return () => stopSpeaking();
    }
    const t = setTimeout(advance, Math.min(9000, Math.max(3200, stop.text.length * DWELL_MS_PER_CHAR)));
    return () => clearTimeout(t);
  }, [playing, stepIdx, route, mode, voiceOn]);

  const select = (id: string) => navigate(`architecture/${id}`);
  const setMode = (m: Mode) =>
    navigate(m === "explore" ? "architecture" : m === "flow" ? `architecture/flow/${route.id}` : "architecture/find");
  const watch = (id: string) => navigate(`architecture/flow/${id}`);

  const inspected = layers.filter((l) => progress.exploredLayers.includes(l.id)).length;
  const allSeen = inspected === layers.length;

  // Map overlays for the current mode
  const flow: FlowOverlay | undefined = useMemo(() => {
    if (mode !== "flow") return undefined;
    const prevEnd = (i: number) => {
      for (let j = i - 1; j >= 0; j--) {
        const ls = route.stops[j].layers;
        if (ls.length) return ls[ls.length - 1];
      }
      return null;
    };
    const legFor = (i: number) => {
      const start = prevEnd(i);
      const ids = [...(start ? [start] : []), ...route.stops[i].layers];
      return ids.filter((id, k) => k === 0 || ids[k - 1] !== id);
    };
    return {
      route: legFor(stepIdx),
      trail: route.stops.slice(0, stepIdx).map((_, i) => legFor(i)),
      key: `${route.id}-${stepIdx}`,
    };
  }, [mode, route, stepIdx]);

  const tones: Record<string, NodeTone> | undefined = useMemo(() => {
    if (mode === "flow") {
      const t: Record<string, NodeTone> = {};
      route.stops.slice(0, stepIdx).forEach((s) => s.layers.forEach((id) => (t[id] = "reach")));
      route.stops[stepIdx].layers.forEach((id) => (t[id] = "active"));
      return t;
    }
    if (mode === "find" && goal) {
      const t: Record<string, NodeTone> = {};
      dependenciesOf(goal.layerId).forEach((e) => (t[e.to] = "lean"));
      dependentsOf(goal.layerId).forEach((e) => (t[e.from] = "impact"));
      t[goal.layerId] = "goal";
      return t;
    }
    return undefined;
  }, [mode, route, stepIdx, goal]);

  const edgeTone =
    mode === "find" && goal
      ? (e: Edge) => (e.to === goal.layerId ? "impact" : e.from === goal.layerId ? "lean" : null)
      : undefined;

  return (
    <div className="architecture">
      <ScreenHeader
        eyebrow="01 Understand · Architecture"
        title={`How ${pack.overview.repo.name} fits together`}
        lede="Six layers, in plain English. Explore the map, watch a real request travel through it, or find exactly where your change belongs — every line on the map is backed by source."
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

      <div className="arch-modes" role="tablist" aria-label="Ways to explore the architecture">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            className={`arch-mode ${mode === m.id ? "is-on" : ""}`}
            onClick={() => setMode(m.id)}
          >
            <strong>{m.label}</strong>
            <span>{m.hint}</span>
          </button>
        ))}
      </div>

      <div className="arch-layout">
        <div className={`arch-canvas-wrap arch-canvas-wrap--${mode}`}>
          <SystemMap
            selected={selected?.id ?? null}
            explored={progress.exploredLayers}
            onSelect={select}
            tones={tones}
            edgeTone={edgeTone}
            flow={flow}
          />
          <div className="graph-legend" aria-hidden="true">
            {mode === "find" && goal ? (
              <>
                <span>
                  <i className="lg-dot lg-dot--goal" /> Start here
                </span>
                <span>
                  <i className="lg-dot lg-dot--impact" /> Could break
                </span>
                <span>
                  <i className="lg-dot lg-dot--lean" /> Leans on
                </span>
              </>
            ) : mode === "flow" ? (
              <>
                <span>
                  <i className="lg-dot lg-dot--goal" /> Where the request is now
                </span>
                <span>
                  <i className="lg-dot lg-dot--reach" /> Already visited
                </span>
              </>
            ) : (
              <>
                <span>
                  <i className="lg-edge" /> Calls — dots move in the direction of the call
                </span>
                <span>
                  <i className="lg-seen">
                    <IconCheck size={9} strokeWidth={3} />
                  </i>{" "}
                  Inspected
                </span>
              </>
            )}
            <span className="lg-right">
              <Tag tone="verified">OBSERVED</Tag> {edges.filter((e) => e.basis === "observed").length}/{edges.length}{" "}
              links cited
            </span>
          </div>
        </div>

        <aside className="arch-panel" aria-live="polite">
          {mode === "flow" ? (
            <FlowPanel
              route={route}
              stepIdx={stepIdx}
              setStepIdx={setStepIdx}
              playing={playing}
              setPlaying={setPlaying}
              onPick={watch}
              navigate={navigate}
            />
          ) : mode === "find" ? (
            <FinderPanel
              goalId={goalId}
              onGoal={(id) => navigate(`architecture/find/${id}`)}
              onSelect={select}
              onWatch={watch}
              navigate={navigate}
            />
          ) : selected ? (
            <NodeDetail layer={selected} onSelect={select} onWatch={watch} />
          ) : (
            <ExploreIntro onSelect={select} onMode={setMode} />
          )}
        </aside>
      </div>

      <details className="ov-section arch-all">
        <summary className="section-head">
          <h2 className="section-title">All {edges.length} relationships, with evidence</h2>
          <span className="section-hint">Show</span>
        </summary>
        <ul className="rel-list rel-list--table">
          {edges.map((e, i) => (
            <RelationRow key={i} e={e} dir="out" onSelect={select} showFrom />
          ))}
        </ul>
      </details>
    </div>
  );
}
