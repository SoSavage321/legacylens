import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Basis, Evidence } from "../types/pack";
import {
  SHORT_COMMIT,
  citationsFor,
  confidenceOf,
  formatLines,
  isVerified,
  sourceUrl,
} from "../lib/evidence";
import { ConfidenceBadge, GhostButton, Tag } from "./ui";
import { IconClose, IconEvidence, IconExternal, IconFile, IconFolder } from "./Icons";

// ---------------------------------------------------------------------------
// Drawer requests
// ---------------------------------------------------------------------------

export interface ClaimRequest {
  kind: "claim";
  /** Where this claim comes from, e.g. "Architecture · Data Layer" */
  context: string;
  claim: string;
  basis?: Basis;
  /** Additional reasoning shown under "Why we think this" */
  why?: ReactNode;
  evidence: Evidence[];
}

export interface FileRequest {
  kind: "file";
  path: string;
}

export type EvidenceRequest = ClaimRequest | FileRequest;

interface EvidenceContextValue {
  open: (req: EvidenceRequest) => void;
}

const EvidenceContext = createContext<EvidenceContextValue | null>(null);

export function useEvidence(): EvidenceContextValue {
  const ctx = useContext(EvidenceContext);
  if (!ctx) throw new Error("useEvidence must be used inside EvidenceProvider");
  return ctx;
}

export function EvidenceProvider({ children }: { children: ReactNode }) {
  // A stack so "all citations of this file" can be opened and backed out of.
  const [stack, setStack] = useState<EvidenceRequest[]>([]);
  const returnFocus = useRef<HTMLElement | null>(null);

  const open = useCallback((req: EvidenceRequest) => {
    setStack((s) => {
      if (s.length === 0) returnFocus.current = document.activeElement as HTMLElement | null;
      return [...s, req];
    });
  }, []);

  const close = useCallback(() => {
    setStack([]);
    // Restore focus to whatever opened the drawer
    requestAnimationFrame(() => returnFocus.current?.focus());
  }, []);

  const back = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <EvidenceContext.Provider value={value}>
      {children}
      {stack.length > 0 && (
        <EvidenceDrawer
          request={stack[stack.length - 1]}
          depth={stack.length}
          onClose={close}
          onBack={back}
        />
      )}
    </EvidenceContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// EvidencePanel (drawer)
// ---------------------------------------------------------------------------

function EvidenceDrawer({
  request,
  depth,
  onClose,
  onBack,
}: {
  request: EvidenceRequest;
  depth: number;
  onClose: () => void;
  onBack: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [request]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (depth > 1) onBack();
        else onClose();
      }
      if (e.key === "Tab" && panelRef.current) {
        // Keep keyboard focus inside the drawer while it is open
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex="0"]'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [depth, onBack, onClose]);

  return (
    <div className="drawer-root">
      <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <div className="drawer-bar">
          <div className="drawer-bar-left">
            {depth > 1 && (
              <GhostButton onClick={onBack} aria-label="Back to previous evidence">
                ← Back
              </GhostButton>
            )}
            <span className="drawer-kicker">
              <IconEvidence size={14} /> Evidence · pinned to <code>{SHORT_COMMIT}</code>
            </span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close evidence panel">
            <IconClose />
          </button>
        </div>
        <div className="drawer-body" key={depth}>
          {request.kind === "claim" ? (
            <ClaimView req={request} headingRef={headingRef} />
          ) : (
            <FileView path={request.path} headingRef={headingRef} />
          )}
        </div>
      </div>
    </div>
  );
}

function ClaimView({
  req,
  headingRef,
}: {
  req: ClaimRequest;
  headingRef: React.RefObject<HTMLHeadingElement>;
}) {
  const verified = req.evidence.filter(isVerified).length;
  const level = confidenceOf(req.basis, req.evidence);
  return (
    <>
      <div className="drawer-context">{req.context}</div>

      <section className="ev-section ev-section--claim" aria-labelledby="drawer-title">
        <div className="ev-label">
          <span className="ev-label-key">Claim</span>
          <ConfidenceBadge level={level} basis={req.basis} citations={verified} />
        </div>
        <h2 id="drawer-title" ref={headingRef} tabIndex={-1} className="ev-claim">
          {req.claim}
        </h2>
      </section>

      <section className="ev-section ev-section--why">
        <div className="ev-label">
          <span className="ev-label-key">Why we think this</span>
          <span className="ev-label-hint">interpretation</span>
        </div>
        <p className="ev-why">
          {req.basis === "inferred"
            ? "Inferred — this connects the cited code but is not stated verbatim in it. Review the evidence before relying on it."
            : req.basis === "observed"
              ? "Observed — read directly from the cited lines of source."
              : "Summarised from the cited source files."}
        </p>
        {req.why && <div className="ev-why ev-why--extra">{req.why}</div>}
      </section>

      <section className="ev-section">
        <div className="ev-label">
          <span className="ev-label-key">Evidence</span>
          <span className="ev-label-hint">
            {verified}/{req.evidence.length} resolved at {SHORT_COMMIT}
          </span>
        </div>
        {req.evidence.length === 0 ? (
          <p className="ev-empty">
            No source citations were recorded for this claim. Treat it as unverified.
          </p>
        ) : (
          <div className="ev-list">
            {req.evidence.map((ev, i) => (
              <CodeEvidence key={`${ev.path}-${i}`} ev={ev} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function FileView({
  path,
  headingRef,
}: {
  path: string;
  headingRef: React.RefObject<HTMLHeadingElement>;
}) {
  const citations = citationsFor(path);
  const isDir = path.endsWith("/");
  return (
    <>
      <div className="drawer-context">{isDir ? "Directory" : "File"} dossier</div>
      <section className="ev-section ev-section--claim">
        <h2 id="drawer-title" ref={headingRef} tabIndex={-1} className="ev-file-title">
          {isDir ? <IconFolder size={18} /> : <IconFile size={18} />}
          <code>{path}</code>
        </h2>
        <p className="ev-why">
          {citations.length > 0
            ? `Cited ${citations.length} time${citations.length === 1 ? "" : "s"} across the onboarding pack.`
            : "Referenced by the reading path, but no claim cites specific lines here yet."}
        </p>
        <a className="source-link" href={sourceUrl({ path })} target="_blank" rel="noreferrer">
          Open {isDir ? "directory" : "file"} at {SHORT_COMMIT} <IconExternal size={13} />
        </a>
      </section>
      {citations.length > 0 && (
        <section className="ev-section">
          <div className="ev-label">
            <span className="ev-label-key">Claims that cite this {isDir ? "directory" : "file"}</span>
          </div>
          <ol className="dossier-list">
            {citations.map(({ claim, evidence }, i) => (
              <li key={`${claim.id}-${i}`} className="dossier-item">
                <div className="dossier-context">{claim.context}</div>
                <p className="dossier-text">{claim.text}</p>
                <CodeEvidence ev={evidence} hideFileLink />
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// CodeEvidence — structured rectangular block for a single citation
// ---------------------------------------------------------------------------

export function CodeEvidence({ ev, hideFileLink }: { ev: Evidence; hideFileLink?: boolean }) {
  const { open } = useEvidence();
  const verified = isVerified(ev);
  const lines = formatLines(ev);
  return (
    <figure className="code-ev">
      <figcaption className="code-ev-head">
        <span className="code-ev-path">
          <IconFile size={13} />
          <code>{ev.path}</code>
          {lines && <span className="code-ev-lines">{lines}</span>}
        </span>
        {verified ? (
          <Tag tone="verified" title={`Path and line range resolved at commit ${SHORT_COMMIT}`}>
            VERIFIED
          </Tag>
        ) : (
          <Tag tone="review" title="Not confirmed at the analysed commit">
            REVIEW
          </Tag>
        )}
      </figcaption>
      <div className="code-ev-body">
        <span className="code-ev-gutter" aria-hidden="true">
          {ev.lines ? ev.lines[0] : "—"}
        </span>
        <code className="code-ev-note">
          {ev.note ?? (ev.lines ? `lines ${ev.lines[0]}–${ev.lines[1]}` : "whole path")}
        </code>
      </div>
      <div className="code-ev-foot">
        <a className="source-link" href={sourceUrl(ev)} target="_blank" rel="noreferrer">
          Open source <IconExternal size={12} />
        </a>
        {!hideFileLink && citationsFor(ev.path).length > 1 && (
          <button className="link-btn" onClick={() => open({ kind: "file", path: ev.path })}>
            {citationsFor(ev.path).length} claims cite this file
          </button>
        )}
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// FileReference — inline chip that opens the file dossier
// ---------------------------------------------------------------------------

export function FileReference({ path, lines }: { path: string; lines?: [number, number] }) {
  const { open } = useEvidence();
  const isDir = path.endsWith("/");
  return (
    <button
      className="file-ref"
      onClick={() => open({ kind: "file", path })}
      title={`Show everything the pack knows about ${path}`}
    >
      {isDir ? <IconFolder size={12} /> : <IconFile size={12} />}
      <code>{path}</code>
      {lines && <span className="file-ref-lines">{formatLines({ lines })}</span>}
    </button>
  );
}

/** "View evidence" trigger that shows claim-level confidence inline. */
export function EvidenceButton({
  req,
  label = "View evidence",
}: {
  req: ClaimRequest;
  label?: string;
}) {
  const { open } = useEvidence();
  const n = req.evidence.length;
  return (
    <button className="ev-btn" onClick={() => open(req)}>
      <IconEvidence size={13} />
      {label}
      <span className="ev-btn-count">{n}</span>
    </button>
  );
}
