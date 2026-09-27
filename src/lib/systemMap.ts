/**
 * Derived views over the architecture that answer the questions new developers
 * actually get stuck on: where does a request go, where does my change belong,
 * and what else will it touch. Everything is computed from the verified pack —
 * layer paths, edges and workflow citations — nothing is hand-written per repo
 * except the plain-English role of each kind of layer.
 */
import type { WorkflowId } from "../types/pack";
import { getPack } from "./pack";

const pack = getPack();
const { layers, edges } = pack.architecture;

// ---------------------------------------------------------------------------
// Which layer does a file belong to?
// ---------------------------------------------------------------------------

// Folders the layer paths don't list but whose role is unambiguous.
const FOLDER_HINTS: [string, string][] = [
  ["src/app/api/", "external_services"],
  ["src/components/", "ui_routes"],
  ["src/app/", "ui_routes"],
];

/** Longest matching layer path wins; falls back to folder hints; null when unknown. */
export function layerOfPath(path: string): string | null {
  let best: string | null = null;
  let len = 0;
  for (const l of layers) {
    for (const lp of l.paths) {
      const match = lp.endsWith("/") ? path.startsWith(lp) : path === lp;
      if (match && lp.length > len) {
        best = l.id;
        len = lp.length;
      }
    }
  }
  if (best) return best;
  const hint = FOLDER_HINTS.find(([prefix, id]) => path.startsWith(prefix) && layers.some((l) => l.id === id));
  return hint ? hint[1] : null;
}

// ---------------------------------------------------------------------------
// A workflow as a route across the map
// ---------------------------------------------------------------------------

export interface RouteStop {
  order: number;
  text: string;
  /** Layers this step passes through, in citation order */
  layers: string[];
  files: string[];
}

export interface WorkflowRoute {
  id: WorkflowId;
  name: string;
  actor: string;
  summary: string;
  externalServices: string[];
  needsSecretsToRun: boolean;
  stops: RouteStop[];
  /** Every layer the workflow reaches */
  reach: string[];
}

function dedupe(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) === i);
}

export const ROUTES: WorkflowRoute[] = pack.workflows.workflows.map((w) => {
  let last: string | null = null;
  const stops: RouteStop[] = w.steps.map((s) => {
    const ls = dedupe(s.evidence.map((e) => layerOfPath(e.path)).filter((x): x is string => !!x));
    // A step whose files map nowhere stays where the previous step was
    const stepLayers = ls.length ? ls : last ? [last] : [];
    if (stepLayers.length) last = stepLayers[stepLayers.length - 1];
    return { order: s.order, text: s.text, layers: stepLayers, files: dedupe(s.evidence.map((e) => e.path)) };
  });
  return {
    id: w.id,
    name: w.name,
    actor: w.actor,
    summary: w.summary,
    externalServices: w.externalServices,
    needsSecretsToRun: w.needsSecretsToRun,
    stops,
    reach: dedupe(stops.flatMap((s) => s.layers)),
  };
});

// ---------------------------------------------------------------------------
// Plain-English role of each layer
// ---------------------------------------------------------------------------

export interface LayerRole {
  /** Short badge, e.g. "What users see" */
  tag: string;
  /** One sentence a developer on day one can follow */
  plain: string;
}

const ROLES: Record<string, LayerRole> = {
  ui_routes: {
    tag: "What users see",
    plain: "Every page and layout. Each request enters the app here, so this is the front door.",
  },
  server_actions: {
    tag: "What changes data",
    plain: "Functions that forms and buttons call to write to the database or call paid services.",
  },
  data: {
    tag: "Where data lives",
    plain: "The database schema and the read queries that feed every page.",
  },
  auth: {
    tag: "Who gets in",
    plain: "Decides which pages need a signed-in user, and sends everyone else to sign in.",
  },
  external_services: {
    tag: "Outside the codebase",
    plain: "Other companies' services the app relies on, and the keys it needs to reach them.",
  },
  content: {
    tag: "The blog",
    plain: "Markdown posts turned into pages when the site is built.",
  },
};

export function roleOf(id: string): LayerRole {
  return ROLES[id] ?? { tag: "Layer", plain: layers.find((l) => l.id === id)?.summary ?? "" };
}

/** Tiers read top to bottom the way a request travels. */
export const TIERS: { label: string; y: number }[] = [
  { label: "Where requests enter", y: 90 },
  { label: "Where the work happens", y: 305 },
  { label: "Outside the codebase", y: 505 },
];

// ---------------------------------------------------------------------------
// Impact: what a change in a layer reaches
// ---------------------------------------------------------------------------

/** Layers this one calls into — your change will lean on them. */
export function dependenciesOf(id: string) {
  return edges.filter((e) => e.from === id);
}

/** Layers that call into this one — a change here can break them. */
export function dependentsOf(id: string) {
  return edges.filter((e) => e.to === id);
}

/** Workflows that pass through a layer. */
export function workflowsThrough(id: string): WorkflowRoute[] {
  return ROUTES.filter((r) => r.reach.includes(id));
}

/** External services you'll need credentials for when running workflows through this layer. */
export function secretsFor(id: string): string[] {
  return dedupe(workflowsThrough(id).filter((r) => r.needsSecretsToRun).flatMap((r) => r.externalServices));
}

/** Reading-path steps that cover a layer's folders. */
export function readingFor(id: string) {
  const layer = layers.find((l) => l.id === id);
  if (!layer) return [];
  return pack.readingOrder.steps
    .filter((s) => s.paths.some((p) => layerOfPath(p) === id || layer.paths.some((lp) => p.startsWith(lp) || lp.startsWith(p))))
    .sort((a, b) => a.order - b.order);
}

// ---------------------------------------------------------------------------
// "I want to…" — goals mapped to the layer where the change starts
// ---------------------------------------------------------------------------

export interface Goal {
  id: string;
  label: string;
  layerId: string;
}

export const GOALS: Goal[] = (
  [
    { id: "page", label: "Add or change a page", layerId: "ui_routes" },
    { id: "form", label: "Change what a form or button does", layerId: "server_actions" },
    { id: "db", label: "Add a column or change a query", layerId: "data" },
    { id: "protect", label: "Put a page behind sign-in", layerId: "auth" },
    { id: "service", label: "Connect a third-party service or API key", layerId: "external_services" },
    { id: "blog", label: "Publish or edit a blog post", layerId: "content" },
  ] as Goal[]
).filter((g) => layers.some((l) => l.id === g.layerId));
