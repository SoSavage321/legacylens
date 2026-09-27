import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getPack } from "../lib/pack";
import { FILES } from "../lib/evidence";
import { useEvidence } from "./Evidence";
import {
  IconArchitecture,
  IconFile,
  IconFolder,
  IconLearn,
  IconOverview,
  IconSearch,
  IconWorkflows,
} from "./Icons";

const pack = getPack();

interface Item {
  id: string;
  group: "Screens" | "Architecture" | "Workflows" | "Reading path" | "Files";
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette({
  onClose,
  navigate,
}: {
  onClose: () => void;
  navigate: (to: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { open } = useEvidence();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => prev?.focus();
  }, []);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      navigate(to);
      onClose();
    };
    const screens: Item[] = [
      ["overview", "Overview", "Where am I?"],
      ["architecture", "Architecture", "Map of the system"],
      ["workflows", "Workflows", "Trace the important journeys"],
      ["learn", "Learn", "Reading path & knowledge check"],
      ["task", "First Task", "Your first safe change"],
      ["evidence", "Evidence", "Verification ledger"],
      ["settings", "Settings", "Progress & data"],
    ].map(([id, label, hint]) => ({
      id: `screen.${id}`,
      group: "Screens" as const,
      label,
      hint,
      icon: <IconOverview size={14} />,
      run: go(id),
    }));
    const layers: Item[] = pack.architecture.layers.map((l) => ({
      id: `layer.${l.id}`,
      group: "Architecture",
      label: l.name,
      hint: l.paths.slice(0, 2).join("  "),
      icon: <IconArchitecture size={14} />,
      run: go(`architecture/${l.id}`),
    }));
    const workflows: Item[] = pack.workflows.workflows.map((w) => ({
      id: `wf.${w.id}`,
      group: "Workflows",
      label: w.name,
      hint: `${w.steps.length} steps · ${w.actor}`,
      icon: <IconWorkflows size={14} />,
      run: go(`workflows/${w.id}`),
    }));
    const steps: Item[] = pack.readingOrder.steps.map((s) => ({
      id: `step.${s.id}`,
      group: "Reading path",
      label: `${String(s.order).padStart(2, "0")} ${s.title}`,
      hint: `${s.minutes} min`,
      icon: <IconLearn size={14} />,
      run: go(`learn/${s.id}`),
    }));
    const files: Item[] = [...FILES.values()]
      .sort((a, b) => b.citations.length - a.citations.length)
      .map((f) => ({
        id: `file.${f.path}`,
        group: "Files",
        label: f.path,
        hint: `${f.citations.length} citation${f.citations.length === 1 ? "" : "s"}`,
        icon: f.path.endsWith("/") ? <IconFolder size={14} /> : <IconFile size={14} />,
        run: () => {
          onClose();
          open({ kind: "file", path: f.path });
        },
      }));
    return [...screens, ...layers, ...workflows, ...steps, ...files];
  }, [navigate, onClose, open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((i) => `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(q))
      : items.filter((i) => i.group !== "Files").concat(items.filter((i) => i.group === "Files").slice(0, 6));
    return filtered.slice(0, 40);
  }, [items, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = "";
  return (
    <div className="palette-root" onKeyDown={onKeyDown}>
      <div className="palette-scrim" onClick={onClose} aria-hidden="true" />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="palette-input">
          <IconSearch size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a file, layer, workflow or reading step…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `pal-${active}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="palette-list" ref={listRef} className="palette-list" role="listbox">
          {results.length === 0 && (
            <li className="palette-empty">
              Nothing in the onboarding pack matches “{query}”. Try a file name like <code>cart.ts</code>.
            </li>
          )}
          {results.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {header && <div className="palette-group">{header}</div>}
                <div
                  id={`pal-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  className={`palette-item ${i === active ? "palette-item--active" : ""}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => item.run()}
                >
                  <span className="palette-icon">{item.icon}</span>
                  <span className={`palette-label ${item.group === "Files" ? "mono" : ""}`}>{item.label}</span>
                  {item.hint && <span className="palette-hint">{item.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
