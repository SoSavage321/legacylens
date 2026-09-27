import type { Basis, Evidence } from "../types/pack";
import { getPack } from "./pack";

const pack = getPack();

export const REPO_URL = pack.overview.repo.url;
export const COMMIT = pack.overview.meta.repoCommit;
export const SHORT_COMMIT = COMMIT.slice(0, 7);

// ---------------------------------------------------------------------------
// Source links & verification
// ---------------------------------------------------------------------------

/** GitHub permalink for a citation, pinned to the analysed commit. */
export function sourceUrl(ev: Pick<Evidence, "path" | "lines">): string {
  const isDir = ev.path.endsWith("/");
  const path = ev.path
    .replace(/\/$/, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const base = `${REPO_URL}/${isDir ? "tree" : "blob"}/${COMMIT}/${path}`;
  return ev.lines && !isDir ? `${base}#L${ev.lines[0]}-L${ev.lines[1]}` : base;
}

interface VerificationFailure {
  path: string;
  lines?: [number, number];
}

const failures = (pack.verification.failures as VerificationFailure[] | undefined) ?? [];

/** Verification is only meaningful when it was run against the pack's commit. */
export const verificationCurrent = pack.verification.repoCommit === COMMIT;
export const verificationTotal = pack.verification.total ?? 0;
export const verificationResolved =
  (pack.verification.resolved as number | undefined) ?? verificationTotal - failures.length;
export const verificationCheckedAt = pack.verification.checkedAt;

export function isVerified(ev: Evidence): boolean {
  if (!verificationCurrent) return false;
  return !failures.some(
    (f) =>
      f.path === ev.path &&
      (!f.lines || !ev.lines || (f.lines[0] === ev.lines[0] && f.lines[1] === ev.lines[1]))
  );
}

export function formatLines(ev: Pick<Evidence, "lines">): string {
  if (!ev.lines) return "";
  const [a, b] = ev.lines;
  return a === b ? `L${a}` : `L${a}–${b}`;
}

// ---------------------------------------------------------------------------
// Confidence — derived from evidence quality, never invented
// ---------------------------------------------------------------------------

export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * high   = observed in source, at least one citation resolved at the commit
 * medium = inferred (interpretation), backed by resolved citations
 * low    = no resolved citations
 */
export function confidenceOf(basis: Basis | undefined, evidence: Evidence[]): ConfidenceLevel {
  const verified = evidence.filter(isVerified).length;
  if (verified === 0) return "low";
  if (basis === "inferred") return "medium";
  return "high";
}

// ---------------------------------------------------------------------------
// Claim index — every evidence-backed statement in the pack
// ---------------------------------------------------------------------------

export interface IndexedClaim {
  id: string;
  /** Where the claim lives, e.g. "Architecture · Data Layer" */
  context: string;
  text: string;
  basis?: Basis;
  evidence: Evidence[];
  /** Hash route that shows this claim in context */
  route: string;
}

function buildClaims(): IndexedClaim[] {
  const out: IndexedClaim[] = [];
  const { overview, architecture, workflows, quiz, tasks } = pack;

  const overviewGroups = [
    ["Stack", overview.stack],
    ["Entry point", overview.entryPoints],
    ["Key fact", overview.keyFacts],
  ] as const;
  for (const [label, claims] of overviewGroups) {
    claims.forEach((c, i) =>
      out.push({
        id: `overview.${label}.${i}`,
        context: `Overview · ${label}`,
        text: c.text,
        basis: c.basis,
        evidence: c.evidence,
        route: "overview",
      })
    );
  }

  const layerName = (id: string) => architecture.layers.find((l) => l.id === id)?.name ?? id;
  for (const l of architecture.layers) {
    out.push({
      id: `layer.${l.id}`,
      context: `Architecture · ${l.name}`,
      text: l.summary,
      evidence: l.evidence,
      route: `architecture/${l.id}`,
    });
  }
  architecture.edges.forEach((e, i) =>
    out.push({
      id: `edge.${i}`,
      context: `Architecture · ${layerName(e.from)} → ${layerName(e.to)}`,
      text: `${layerName(e.from)} ${e.label}.`,
      basis: e.basis,
      evidence: e.evidence,
      route: `architecture/${e.from}`,
    })
  );

  for (const w of workflows.workflows) {
    for (const s of w.steps) {
      out.push({
        id: `wf.${w.id}.${s.order}`,
        context: `Workflow · ${w.name} · step ${s.order}`,
        text: s.text,
        basis: w.basis,
        evidence: s.evidence,
        route: `workflows/${w.id}/${s.order}`,
      });
    }
  }

  for (const q of quiz.questions) {
    out.push({
      id: `quiz.${q.id}`,
      context: `Knowledge check · ${q.prompt}`,
      text: q.explanation,
      basis: "observed",
      evidence: q.evidence,
      route: "learn",
    });
  }

  for (const c of tasks.candidates) {
    out.push({
      id: `task.${c.id}`,
      context: `First task · ${c.title}`,
      text: c.reason,
      evidence: c.evidence,
      route: "task",
    });
  }
  return out;
}

export const CLAIMS = buildClaims();

export interface FileEntry {
  path: string;
  citations: { claim: IndexedClaim; evidence: Evidence }[];
}

function buildFileIndex(): Map<string, FileEntry> {
  const map = new Map<string, FileEntry>();
  for (const claim of CLAIMS) {
    for (const ev of claim.evidence) {
      const entry = map.get(ev.path) ?? { path: ev.path, citations: [] };
      entry.citations.push({ claim, evidence: ev });
      map.set(ev.path, entry);
    }
  }
  return map;
}

export const FILES = buildFileIndex();

export function citationsFor(path: string): FileEntry["citations"] {
  return FILES.get(path)?.citations ?? [];
}
