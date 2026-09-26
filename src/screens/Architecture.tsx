import { useEffect, useRef, useState } from "react";
import type { Architecture } from "@/src/types/pack";

interface Props {
  architecture: Architecture;
}

type Layer = Architecture["layers"][number];

function EvidenceTag({ path, lines, note }: { path: string; lines?: [number, number]; note?: string }) {
  const label = lines ? `${path}:${lines[0]}-${lines[1]}` : path;
  return (
    <span className="evidence-link" title={note ?? label}>
      {label}
    </span>
  );
}

function LayerPanel({ layer, onClose }: { layer: Layer; onClose: () => void }) {
  return (
    <div className="arch-panel">
      <div className="arch-panel-header">
        <span className="arch-panel-title">{layer.name}</span>
        <button className="arch-panel-close" onClick={onClose} aria-label="Close panel">✕</button>
      </div>
      <p className="arch-panel-summary">{layer.summary}</p>

      {layer.paths.length > 0 && (
        <div className="arch-panel-section">
          <div className="arch-panel-label">Paths</div>
          <ul className="arch-path-list">
            {layer.paths.map((p) => (
              <li key={p} className="arch-path-item">
                <code>{p}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {layer.evidence.length > 0 && (
        <div className="arch-panel-section">
          <div className="arch-panel-label">Evidence</div>
          <div className="claim-evidence">
            {layer.evidence.map((ev, i) => (
              <EvidenceTag key={i} {...ev} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LayerList({
  layers,
  selected,
  onSelect,
}: {
  layers: Layer[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="arch-layer-list">
      {layers.map((layer) => (
        <li key={layer.id}>
          <button
            className={`arch-layer-btn${selected === layer.id ? " arch-layer-btn--active" : ""}`}
            onClick={() => onSelect(layer.id)}
          >
            <span className="arch-layer-name">{layer.name}</span>
            <span className="arch-layer-paths">{layer.paths.length} path{layer.paths.length !== 1 ? "s" : ""}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function ArchitectureScreen({ architecture }: Props) {
  const mermaidRef = useRef<HTMLDivElement>(null);
  const [mermaidOk, setMermaidOk] = useState<boolean | null>(null); // null = loading
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
        const id = "arch-diagram";
        const { svg } = await mermaid.render(id, architecture.mermaid);
        if (!cancelled && mermaidRef.current) {
          mermaidRef.current.innerHTML = svg;
          setMermaidOk(true);
        }
      } catch {
        if (!cancelled) setMermaidOk(false);
      }
    })();
    return () => { cancelled = true; };
  }, [architecture.mermaid]);

  const selectedLayer = selectedId
    ? architecture.layers.find((l) => l.id === selectedId) ?? null
    : null;

  return (
    <div className="arch-screen">
      <div className="arch-diagram-wrap">
        {mermaidOk === false ? (
          /* Mermaid failed — show fallback layer list inline */
          <div className="arch-fallback">
            <p className="arch-fallback-notice">Diagram unavailable — select a layer below.</p>
            <LayerList
              layers={architecture.layers}
              selected={selectedId}
              onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
            />
          </div>
        ) : (
          <>
            <div ref={mermaidRef} className="arch-mermaid" />
            {mermaidOk === null && (
              <p className="arch-loading">Rendering diagram…</p>
            )}
          </>
        )}
      </div>

      {mermaidOk !== false && (
        <div className="arch-layers-section">
          <h3 className="section-title">Layers</h3>
          <LayerList
            layers={architecture.layers}
            selected={selectedId}
            onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
          />
        </div>
      )}

      {selectedLayer && (
        <LayerPanel
          layer={selectedLayer}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
