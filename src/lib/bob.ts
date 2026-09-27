/**
 * Bob's answer engine.
 *
 * Bob (IBM Bob) analysed the target repository offline and wrote the verified
 * onboarding pack. At runtime LegacyLens does not call a model: this module
 * answers questions by retrieving from that pack, so every answer is built from
 * statements Bob wrote and `verify_pack.mjs` checked, with their citations.
 */
import type { Basis, Evidence, WorkflowId } from "../types/pack";
import type { Screen } from "./router";
import type { Milestone } from "./progress";
import type { LearnProgress, ReadinessBreakdown } from "./readiness";
import { getPack } from "./pack";
import { CLAIMS, SHORT_COMMIT, verificationResolved, verificationTotal } from "./evidence";
import { GOALS } from "./systemMap";

const pack = getPack();
const { overview, architecture, workflows, readingOrder, quiz, tasks } = pack;

// ---------------------------------------------------------------------------
// How Bob built the pack (mirrors README §7 "How IBM Bob Was Used")
// ---------------------------------------------------------------------------

export interface BobTask {
  id: string;
  title: string;
  member: string;
  mode: string;
  produced: string;
  phase: "Setup" | "Analyse" | "Verify" | "Build" | "Validate";
}

export const BOB_TASKS: BobTask[] = [
  { id: "B01", title: "/init + AGENTS.md", member: "M1", mode: "Agent", phase: "Setup", produced: "Captured non-obvious repo conventions as AGENTS.md rules and a .bobignore." },
  { id: "B06", title: "Custom mode + packschema skill", member: "M1", mode: "Agent", phase: "Setup", produced: "Created the LegacyLens Onboarding Analyst mode and the schema every pack file follows." },
  { id: "B02", title: "Overview + architecture", member: "M1", mode: "Onboarding Analyst", phase: "Analyse", produced: "Parallel Explore subagents mapped 6 layers and 8 relationships." },
  { id: "B03", title: "Workflow analysis", member: "M2", mode: "Onboarding Analyst", phase: "Analyse", produced: "Traced 5 end-to-end workflows with file-and-line evidence at every step." },
  { id: "B04", title: "Reading path", member: "M3", mode: "Onboarding Analyst", phase: "Analyse", produced: "Ordered 9 reading steps, 155 minutes, covering every workflow." },
  { id: "B05", title: "Quiz + readiness model", member: "M4", mode: "Onboarding Analyst", phase: "Analyse", produced: "10 questions grounded in real code, and the 80% readiness gate." },
  { id: "B07", title: "Safe first task", member: "M5", mode: "Onboarding Analyst", phase: "Analyse", produced: "Scored candidate changes by risk and picked the safest one with its blast radius." },
  { id: "B11", title: "Pack verification", member: "M1", mode: "Onboarding Analyst", phase: "Verify", produced: "Fixed an out-of-range citation instead of weakening the check — every reference resolves." },
  { id: "B08", title: "Validation run", member: "M5", mode: "Agent", phase: "Validate", produced: "Ran typecheck, lint and format against a real Skateshop fix." },
  { id: "B09", title: "Bob code review", member: "M5", mode: "Agent", phase: "Validate", produced: "Bob Findings confirmed the fix correct and complete." },
];

// ---------------------------------------------------------------------------
// Answer shape
// ---------------------------------------------------------------------------

export interface BobItem {
  title: string;
  text: string;
  basis?: Basis;
  evidence: Evidence[];
  route?: string;
}

export type BobAction =
  | { kind: "route"; label: string; route: string }
  | { kind: "tour"; label: string; workflowId: WorkflowId }
  | { kind: "ask"; label: string; question: string };

export interface BobAnswer {
  /** Lead paragraph — this is what Bob says out loud. */
  text: string;
  items?: BobItem[];
  actions?: BobAction[];
  followUps?: string[];
  /** Number of citations behind the answer (0 for navigation/help answers). */
  citations: number;
}

export interface BobContext {
  screen: Screen;
  progress: LearnProgress;
  readiness: ReadinessBreakdown;
  current?: Milestone;
}

// ---------------------------------------------------------------------------
// Corpus — every statement in the pack, as a searchable document
// ---------------------------------------------------------------------------

interface Doc {
  id: string;
  kind: "fact" | "stack" | "entry" | "layer" | "edge" | "step" | "workflow" | "reading" | "quiz" | "task";
  title: string;
  text: string;
  basis?: Basis;
  evidence: Evidence[];
  route: string;
  workflowId?: WorkflowId;
  terms: Map<string, number>;
  titleTerms: Set<string>;
}

const STOP = new Set(
  "a an and are as at be by can do does for from how i in into is it its me my of on or so that the their then there this to was what when where which who why will with you your about tell explain show work works"
    .split(" ")
);

/** Everyday verbs that say nothing about the topic of a question. */
const GENERIC = new Set(
  "happen happens happened fire fires fired trigger triggers call calls called handle handles handled use uses used using need needs get gets make makes find go goes look like run runs start starts mean means put set change changes add adds"
    .split(" ")
);

/** Words people say → words the pack uses. */
const SYNONYMS: Record<string, string[]> = {
  login: ["auth", "clerk", "sign"],
  log: ["auth", "clerk", "sign"],
  signin: ["auth", "clerk", "sign"],
  logout: ["auth", "clerk"],
  authentication: ["auth", "clerk"],
  user: ["auth", "clerk", "customer"],
  users: ["auth", "clerk", "customer"],
  pay: ["payment", "stripe", "checkout"],
  paying: ["payment", "stripe", "checkout"],
  payments: ["payment", "stripe"],
  purchase: ["checkout", "payment", "order"],
  buy: ["checkout", "cart", "payment"],
  basket: ["cart"],
  database: ["db", "drizzle", "postgres", "schema"],
  db: ["database", "drizzle", "postgres"],
  sql: ["drizzle", "postgres", "db"],
  orm: ["drizzle"],
  tables: ["schema", "table"],
  model: ["schema", "table"],
  models: ["schema", "table"],
  seller: ["store", "dashboard", "seller"],
  vendor: ["store", "seller"],
  shop: ["store"],
  item: ["product"],
  items: ["product", "cart"],
  upload: ["uploadthing", "file"],
  images: ["uploadthing", "image"],
  email: ["resend", "newsletter"],
  mail: ["resend", "email"],
  cache: ["redis", "upstash", "caching"],
  rate: ["ratelimit", "upstash"],
  blog: ["contentlayer", "mdx", "content"],
  env: ["environment", "variables", "env"],
  config: ["configuration", "env", "next"],
  secrets: ["env", "environment", "keys"],
  test: ["tests", "testing", "jest", "vitest"],
  tests: ["test", "testing"],
  routes: ["route", "app", "page"],
  pages: ["page", "route", "app"],
  api: ["route", "webhook", "handler"],
  webhook: ["webhook", "stripe"],
  mutation: ["server", "actions"],
  mutations: ["server", "actions"],
  actions: ["action", "server"],
  frontend: ["ui", "components", "page"],
  backend: ["server", "actions", "data"],
  deploy: ["build", "next"],
  build: ["pnpm", "next", "ci"],
};

function splitIdent(word: string): string[] {
  return word
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(" ");
}

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[^A-Za-z0-9_-]+/)) {
    if (!raw) continue;
    const parts = new Set([raw.toLowerCase(), ...splitIdent(raw)]);
    for (const p of parts) {
      if (p.length < 2 || STOP.has(p)) continue;
      out.push(stem(p));
    }
  }
  return out;
}

function makeDoc(d: Omit<Doc, "terms" | "titleTerms">): Doc {
  const terms = new Map<string, number>();
  const pathText = d.evidence.map((e) => `${e.path} ${e.note ?? ""}`).join(" ");
  for (const t of tokenize(`${d.title} ${d.text} ${pathText}`)) terms.set(t, (terms.get(t) ?? 0) + 1);
  return { ...d, terms, titleTerms: new Set(tokenize(d.title)) };
}

const KIND_OF: Record<string, Doc["kind"]> = {
  "overview.Stack": "stack",
  "overview.Entry point": "entry",
  "overview.Key fact": "fact",
  layer: "layer",
  edge: "edge",
  wf: "step",
  quiz: "quiz",
  task: "task",
};

function buildCorpus(): Doc[] {
  // Quiz explanations are the answers — Bob never gives those away.
  const docs: Doc[] = CLAIMS.filter((c) => !c.id.startsWith("quiz.")).map((c) => {
    const prefix = c.id.startsWith("overview.") ? c.id.split(".").slice(0, 2).join(".") : c.id.split(".")[0];
    const wfId = c.id.startsWith("wf.") ? (c.id.split(".")[1] as WorkflowId) : undefined;
    return makeDoc({
      id: c.id,
      kind: KIND_OF[prefix] ?? "fact",
      title: c.context,
      text: c.text,
      basis: c.basis,
      evidence: c.evidence,
      route: c.route,
      workflowId: wfId,
    });
  });
  for (const w of workflows.workflows) {
    docs.push(
      makeDoc({
        id: `workflow.${w.id}`,
        kind: "workflow",
        title: `Workflow · ${w.name}`,
        text: `${w.summary} External services: ${w.externalServices.join(", ") || "none"}.`,
        basis: w.basis,
        evidence: w.steps.flatMap((s) => s.evidence).slice(0, 6),
        route: `workflows/${w.id}`,
        workflowId: w.id,
      })
    );
  }
  for (const s of readingOrder.steps) {
    docs.push(
      makeDoc({
        id: `reading.${s.id}`,
        kind: "reading",
        title: `Reading path · ${s.title}`,
        text: s.why,
        evidence: s.paths.map((path) => ({ path })),
        route: `learn/${s.id}`,
      })
    );
  }
  return docs;
}

const CORPUS = buildCorpus();

const IDF: Map<string, number> = (() => {
  const df = new Map<string, number>();
  for (const d of CORPUS) for (const t of d.terms.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = CORPUS.length;
  const idf = new Map<string, number>();
  for (const [t, f] of df) idf.set(t, Math.log(1 + (n - f + 0.5) / (f + 0.5)));
  return idf;
})();

// Higher-level summaries should win ties against individual steps.
const KIND_BOOST: Partial<Record<Doc["kind"], number>> = { workflow: 1.35, layer: 1.2, fact: 1.15, task: 1.1 };

/**
 * Words from the question that appear nowhere in the pack. When they make up half
 * the question, Bob says he doesn't know rather than passing off a loose match.
 */
function unknownTerms(query: string): string[] {
  const words = query.toLowerCase().match(/[a-z0-9][\w-]*/g) ?? [];
  const content = words.filter((w) => w.length > 2 && !STOP.has(w) && !GENERIC.has(w));
  const unknown = content.filter((w) => {
    const t = tokenize(w);
    return t.length > 0 && t.every((x) => !IDF.has(x) && !SYNONYMS[x]);
  });
  return unknown.length * 2 >= content.length ? unknown : [];
}

function search(query: string, limit = 5): { doc: Doc; score: number }[] {
  const base = tokenize(query);
  const expanded = new Map<string, number>();
  for (const t of base) {
    expanded.set(t, Math.max(expanded.get(t) ?? 0, 1));
    for (const s of SYNONYMS[t] ?? []) expanded.set(stem(s), Math.max(expanded.get(stem(s)) ?? 0, 0.6));
  }
  if (expanded.size === 0) return [];
  const results = CORPUS.map((doc) => {
    let score = 0;
    for (const [t, w] of expanded) {
      const tf = doc.terms.get(t);
      if (!tf) continue;
      const idf = IDF.get(t) ?? 0;
      score += w * idf * ((tf * 2.2) / (tf + 1.2)) * (doc.titleTerms.has(t) ? 1.8 : 1);
    }
    return { doc, score: score * (KIND_BOOST[doc.kind] ?? 1) };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Avoid returning five steps of the same workflow — keep the answer varied.
  const out: typeof results = [];
  const perWf = new Map<string, number>();
  for (const r of results) {
    const key = r.doc.workflowId ?? r.doc.id;
    const n = perWf.get(key) ?? 0;
    if (r.doc.kind === "step" && n >= 2) continue;
    perWf.set(key, n + 1);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers for composing answers
// ---------------------------------------------------------------------------

const repo = overview.repo.name;
const selected = tasks.candidates.find((c) => c.id === tasks.selectedId)!;
const wfById = (id: string) => workflows.workflows.find((w) => w.id === id);

const sentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

function toItem(d: Doc): BobItem {
  return { title: d.title, text: d.text, basis: d.basis, evidence: d.evidence, route: d.route };
}

function countCites(items: BobItem[] | undefined): number {
  return (items ?? []).reduce((n, i) => n + i.evidence.length, 0);
}

function claimItem(title: string, c: { text: string; basis: Basis; evidence: Evidence[] }, route: string): BobItem {
  return { title, text: c.text, basis: c.basis, evidence: c.evidence, route };
}

function nextStepAction(ctx: BobContext): BobAction {
  const m = ctx.current;
  if (!m) return { kind: "route", label: "Review your first task", route: "task" };
  if (m.id === "trace") {
    const wf = workflows.workflows.find(
      (w) => quiz.readiness.requiredWorkflowIds.includes(w.id) && !ctx.progress.completedWorkflows.includes(w.id)
    );
    if (wf) return { kind: "tour", label: `Walk me through ${wf.name}`, workflowId: wf.id };
  }
  if (m.id === "arch") {
    const layer = architecture.layers.find((l) => !ctx.progress.exploredLayers.includes(l.id));
    if (layer) return { kind: "route", label: `Open the ${layer.name} layer`, route: `architecture/${layer.id}` };
  }
  if (m.id === "read") {
    const step = readingOrder.steps
      .filter((s) => s.required)
      .sort((a, b) => a.order - b.order)
      .find((s) => !ctx.progress.readSteps.includes(s.id));
    if (step) return { kind: "route", label: `Read “${step.title}”`, route: `learn/${step.id}` };
  }
  return { kind: "route", label: m.label, route: m.route };
}

// ---------------------------------------------------------------------------
// Intents — questions about the journey rather than the code
// ---------------------------------------------------------------------------

type Intent = (q: string, ctx: BobContext) => BobAnswer | null;

const INTENTS: [RegExp, Intent][] = [
  [
    /(where (does|should|do) (my|this|the|i) (change|code|fix|put)|where (do|should|would) i (put|add|make|start (coding|changing))|which (file|folder|layer) (should|do) i)/i,
    () => ({
      text: `Tell me what you want to do and I'll light up where it starts on the architecture map, what it will touch, and what could break.`,
      actions: GOALS.map((g) => ({ kind: "route" as const, label: g.label, route: `architecture/find/${g.id}` })),
      citations: 0,
    }),
  ],
  [
    /^(hi|hey|hello|yo|help|what can you do|who are you)\b/i,
    () => ({
      text: `Hi, I'm Bob. I analysed ${repo} at commit ${SHORT_COMMIT} and wrote this onboarding pack — ${verificationResolved} of ${verificationTotal} citations verified. Ask me how anything works, where code lives, or what to do next. I'll always show you the source.`,
      followUps: ["Where should I start?", "What will surprise me about this repo?", "How does checkout work?"],
      citations: 0,
    }),
  ],
  [
    /(where (do|should) i (start|begin)|what('?s| is| should i do)? next|what now|guide me|onboard me|get started)/i,
    (_, ctx) => {
      const m = ctx.current;
      const action = nextStepAction(ctx);
      return {
        text: m
          ? `You're ${ctx.readiness.totalScore}% of the way to understanding ${repo}. Next milestone: ${m.label} — ${m.detail}. ${action.label}, and I'll be right here.`
          : `You've finished the journey — your first safe change is made and validated. Pick a bigger task, or ask me about any part of the system.`,
        actions: [action],
        followUps: ["How ready am I?", "What will surprise me about this repo?"],
        citations: 0,
      };
    },
  ],
  [
    /(how (ready|far|am i doing)|my (progress|score|readiness)|readiness|am i ready|unlock)/i,
    (_, ctx) => {
      const r = ctx.readiness;
      const gap = Math.max(0, r.thresholdPercent - r.totalScore);
      return {
        text: r.passed
          ? `You're at ${r.totalScore}% — past the ${r.thresholdPercent}% gate, so your first safe task is unlocked.`
          : `You're at ${r.totalScore}%. The first task unlocks at ${r.thresholdPercent}%, so you need ${gap} more points. Reading is ${r.readingScore}%, the knowledge check ${r.quizScore}%, and workflows ${r.workflowScore}%.${
              r.missingWorkflows.length
                ? ` Still to trace: ${r.missingWorkflows.map((id) => wfById(id)?.name ?? id).join(", ")}.`
                : ""
            }`,
        actions: [r.passed ? { kind: "route", label: "Open first task", route: "task" } : nextStepAction(ctx)],
        citations: 0,
      };
    },
  ],
  [
    /(first (safe )?(task|change|contribution|pr)|why (was )?(this|that) task|task (was )?picked|good first|what (can|should) i (change|fix|work on)|safe (change|task)|contribute)/i,
    () => {
      const items: BobItem[] = [
        { title: `First task · ${selected.title}`, text: selected.reason, evidence: selected.evidence, route: "task" },
      ];
      return {
        text: `I picked “${selected.title}” for you. It's ${selected.risk} risk, touches ${selected.files.length} file (${selected.files.join(", ")}), and needs no secrets to prove. I ruled out ${
          tasks.candidates.filter((c) => c.decision === "rejected").length
        } other candidates as riskier or less instructive.`,
        items,
        actions: [{ kind: "route", label: "Open first task", route: "task" }],
        followUps: ["What could break?", "How do I validate my change?"],
        citations: countCites(items),
      };
    },
  ],
  [
    /(what could (break|go wrong)|blast radius|risk|impact|depend(s|ents) on)/i,
    () => {
      const br = tasks.blastRadius;
      const items: BobItem[] = [
        ...br.directDependents.map((d) => ({
          title: `Direct dependent · ${d.path.split("/").pop()}`,
          text: d.note ?? d.path,
          evidence: [d],
          route: "task",
        })),
        ...br.risks.map((r) => claimItem("Risk", r, "task")),
      ];
      return {
        text: `Changing ${br.changedFiles.join(", ")} reaches ${br.directDependents.length} direct dependents. ${br.indirectImpact[0] ? sentence(br.indirectImpact[0].text) : ""} Rollback is one command: ${br.rollback}.`,
        items,
        actions: [{ kind: "route", label: "See the full blast radius", route: "task" }],
        citations: countCites(items),
      };
    },
  ],
  [
    /(validate|verify my|run the checks|which commands|how do i (check|test)|ci\b)/i,
    () => ({
      text: `Run ${selected.validation.join(", then ")}. These are the same checks Skateshop's CI runs with placeholder env values. There's no automated test suite in this repo, so these three commands are your safety net.`,
      items: [claimItem("Key fact", overview.keyFacts.find((f) => /no automated tests/i.test(f.text)) ?? overview.keyFacts[0], "overview")],
      actions: [{ kind: "route", label: "Open the task checklist", route: "task" }],
      citations: 1,
    }),
  ],
  [
    /(surpris|gotcha|readme (won'?t|doesn'?t)|watch out|should i know|pitfall|outdated|trap)/i,
    () => {
      const items = overview.keyFacts.map((f) => claimItem("What the README won't tell you", f, "overview"));
      return {
        text: `${items.length} things I found in the source that the README gets wrong or leaves out. The big ones: the database is PostgreSQL, not PlanetScale; builds skip type and lint errors; and there are no automated tests.`,
        items,
        citations: countCites(items),
      };
    },
  ],
  [
    /(tech )?stack|built with|framework|technolog|librar(y|ies)|dependenc/i,
    () => {
      const items = overview.stack.map((s) => claimItem(`Stack · ${s.text.split(":")[0]}`, s, "overview"));
      return {
        text: `${repo} is ${/^[aeiou]/i.test(overview.oneLine) ? "an" : "a"} ${overview.oneLine.charAt(0).toLowerCase()}${overview.oneLine.slice(1).replace(/\.$/, "")}. Here's the stack, each item cited to the file that proves it.`,
        items,
        actions: [{ kind: "route", label: "Open the overview", route: "overview" }],
        citations: countCites(items),
      };
    },
  ],
  [
    /(architecture|layers?|structure|big picture|high.level|overview of the (code|system))/i,
    () => {
      const items: BobItem[] = architecture.layers.map((l) => ({
        title: `Layer · ${l.name}`,
        text: l.summary,
        evidence: l.evidence,
        route: `architecture/${l.id}`,
      }));
      return {
        text: `${repo} splits into ${architecture.layers.length} layers with ${architecture.edges.length} observed relationships: ${architecture.layers
          .map((l) => l.name)
          .join(", ")}. UI routes call server actions for writes and query functions for reads; server actions own every external call.`,
        items,
        actions: [
          { kind: "route", label: "Open the architecture map", route: "architecture" },
          { kind: "route", label: "Watch a checkout travel through it", route: "architecture/flow/checkout_payment" },
        ],
        citations: countCites(items),
      };
    },
  ],
  [
    /(which|what) workflows?|list (the )?workflows|(journeys|flows)\b/i,
    () => ({
      text: `I traced ${workflows.workflows.length} workflows end to end: ${workflows.workflows.map((w) => w.name).join(", ")}. ${
        workflows.workflows.filter((w) => w.needsSecretsToRun).length
      } of them need real credentials to run, so read those before you try executing them.`,
      actions: workflows.workflows.slice(0, 3).map((w) => ({ kind: "tour" as const, label: `Walk me through ${w.name}`, workflowId: w.id })),
      citations: 0,
    }),
  ],
  [
    /(how (was|did) (this|you)|who (made|built|wrote)|bob|trust (this|you)|verified|hallucinat)/i,
    () => ({
      text: `I analysed ${repo} in the LegacyLens Onboarding Analyst mode, using parallel subagents to map layers and trace workflows, and wrote every claim with a file and line citation. A verification script then resolved all ${verificationTotal} citations at commit ${SHORT_COMMIT} — ${verificationResolved} passed. Nothing I tell you here is generated on the fly.`,
      actions: [{ kind: "route", label: "Open the verification ledger", route: "evidence" }],
      citations: 0,
    }),
  ],
  [
    /(what should i read|reading (path|order|list)|where to read)/i,
    (_, ctx) => {
      const next = readingOrder.steps
        .filter((s) => s.required)
        .sort((a, b) => a.order - b.order)
        .find((s) => !ctx.progress.readSteps.includes(s.id));
      const total = readingOrder.steps.reduce((n, s) => n + s.minutes, 0);
      return {
        text: next
          ? `Read “${next.title}” next — about ${next.minutes} minutes. ${next.why}`
          : `You've reviewed every required reading step (${total} minutes in all). The ${readingOrder.steps.filter((s) => !s.required).length} optional ones go deeper on caching, layouts and external services.`,
        items: next ? [{ title: `Reading path · step ${next.order}`, text: next.why, evidence: next.paths.map((path) => ({ path })), route: `learn/${next.id}` }] : undefined,
        actions: [{ kind: "route", label: next ? "Start reading" : "Open reading path", route: next ? `learn/${next.id}` : "learn" }],
        followUps: ["How ready am I?"],
        citations: 0,
      };
    },
  ],
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function ask(question: string, ctx: BobContext): BobAnswer {
  const q = question.trim();

  // Explicit tour requests: "walk me through checkout"
  const tour = q.match(/(walk|take|talk|guide) me through (the )?(.+)/i);
  if (tour) {
    const hit = search(tour[3], 8).find((r) => r.doc.workflowId);
    const wf = hit && wfById(hit.doc.workflowId!);
    if (wf) {
      return {
        text: `Sure — ${wf.name} runs in ${wf.steps.length} steps. I'll narrate each one and move through the code with you. ${wf.summary.split(". ")[0]}.`,
        actions: [
          { kind: "tour", label: `Start the ${wf.name} walkthrough`, workflowId: wf.id },
          { kind: "route", label: "Watch it on the architecture map", route: `architecture/flow/${wf.id}` },
        ],
        citations: 0,
      };
    }
  }

  for (const [re, intent] of INTENTS) {
    if (re.test(q)) {
      const a = intent(q, ctx);
      if (a) return a;
    }
  }

  const hits = search(q);
  if (hits.length === 0 || hits[0].score < 1.2) {
    return {
      text: `I couldn't find that in my analysis of ${repo}. I only answer from what I verified in the source, so I'd rather say so than guess. Try naming a feature, a file, or a service — like “cart”, “webhook” or “Clerk”.`,
      followUps: suggestionsFor(ctx.screen),
      citations: 0,
    };
  }

  // A workflow's summary makes a better opening than one of its own steps, if it's nearly as relevant
  const first = hits[0].doc;
  const summary = hits.find(
    (h) =>
      h.doc.kind === "workflow" &&
      first.kind === "step" &&
      h.doc.workflowId === first.workflowId &&
      h.score >= hits[0].score * 0.7
  );
  if (summary && summary !== hits[0]) hits.splice(hits.indexOf(summary), 1).forEach((h) => hits.unshift(h));
  const top = hits[0].doc;
  const items = hits.slice(0, 4).map((h) => toItem(h.doc));
  const unknown = unknownTerms(q);
  const actions: BobAction[] = [];
  const wf = top.workflowId ? wfById(top.workflowId) : undefined;
  if (wf) {
    actions.push({ kind: "tour", label: `Walk me through ${wf.name}`, workflowId: wf.id });
    actions.push({ kind: "route", label: "Watch it on the map", route: `architecture/flow/${wf.id}` });
  }
  if (top.route && !actions.some((a) => a.kind === "route" && a.route === top.route)) {
    actions.push({ kind: "route", label: "Show me in context", route: top.route });
  }

  const body =
    top.kind === "workflow" || top.kind === "layer" || top.kind === "fact"
      ? top.text
      : `${sentence(top.text)}${wf ? ` That's part of the ${wf.name} workflow.` : ""}`;
  const lead = unknown.length
    ? `I didn't find anything about “${unknown.join(" ")}” in ${repo}, so I won't guess. The closest thing I verified: ${body}`
    : body;

  const files = [...new Set(items.flatMap((i) => i.evidence.map((e) => e.path)))].slice(0, 3);
  const followUps = files.length ? [`What else touches ${files[0].split("/").pop()}?`] : [];
  if (wf) followUps.push(`What could break in ${wf.name}?`);

  return { text: lead, items: items.slice(body === top.text ? 1 : 0), actions, followUps, citations: countCites(items) };
}

/** Starter questions tailored to the screen the developer is looking at. */
export function suggestionsFor(screen: Screen): string[] {
  switch (screen) {
    case "architecture":
      return ["Where does my change go?", "How do the layers talk to each other?", "How are dashboard routes protected?"];
    case "workflows":
      return ["Walk me through checkout", "How does add to cart work?", "Which workflows need secrets?"];
    case "learn":
      return ["How ready am I?", "What should I read next?", "How does the Stripe webhook work?"];
    case "task":
      return ["Why was this task picked?", "What could break?", "How do I validate my change?"];
    case "evidence":
      return ["How was this verified?", "What will surprise me about this repo?", "What's the tech stack?"];
    default:
      return ["Where should I start?", "What will surprise me about this repo?", "What's the tech stack?"];
  }
}

/** Bob's spoken welcome on the Overview screen. */
export function briefing(ctx: BobContext): string {
  const facts = overview.keyFacts.length;
  const lead = `Welcome to ${repo}. I'm Bob. I read the whole codebase at commit ${SHORT_COMMIT}, mapped ${architecture.layers.length} layers, traced ${workflows.workflows.length} workflows, and every one of my ${verificationTotal} citations checks out against the source.`;
  const heads = `Heads up: I found ${facts} things the README won't tell you — starting with the fact that the database is PostgreSQL, not PlanetScale.`;
  const next = ctx.current
    ? ctx.readiness.totalScore === 0
      ? `Here's the plan: understand the system, trace the flows that matter, prove it with a short check, then make your first safe change. I've already picked one for you. Let's start with ${nextStepAction(ctx).label.replace(/^Open the /, "the ").replace(/^Walk me through /, "")}.`
      : `You're ${ctx.readiness.totalScore}% there. Next up: ${ctx.current.label.toLowerCase()}.`
    : `You've completed the journey. Nice work.`;
  return `${lead} ${ctx.readiness.totalScore === 0 ? heads + " " : ""}${next}`;
}
