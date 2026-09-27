import { useMemo, useState } from "react";
import {
  CLAIMS,
  COMMIT,
  FILES,
  SHORT_COMMIT,
  verificationCheckedAt,
  verificationCurrent,
  verificationResolved,
  verificationTotal,
} from "@/src/lib/evidence";
import { useEvidence } from "@/src/components/Evidence";
import { EmptyState, ScreenHeader, Tag } from "@/src/components/ui";
import { IconFile, IconFolder, IconSearch } from "@/src/components/Icons";

export default function EvidenceLedgerScreen() {
  const { open } = useEvidence();
  const [filter, setFilter] = useState("");

  const files = useMemo(
    () => [...FILES.values()].sort((a, b) => b.citations.length - a.citations.length || a.path.localeCompare(b.path)),
    []
  );
  const shown = files.filter((f) => f.path.toLowerCase().includes(filter.trim().toLowerCase()));
  const observed = CLAIMS.filter((c) => c.basis === "observed").length;
  const inferred = CLAIMS.filter((c) => c.basis === "inferred").length;
  const failed = verificationTotal - verificationResolved;

  return (
    <div className="ledger">
      <ScreenHeader
        eyebrow="Evidence"
        title="Verification ledger"
        lede={
          <>
            Every file path and line range in the onboarding pack is checked against commit <code>{COMMIT}</code>. If
            a citation doesn't resolve, it's flagged — not hidden.
          </>
        }
      />

      <div className="ledger-stats">
        <div className="stat">
          <span className={`stat-num ${verificationCurrent && failed === 0 ? "tone-verified" : "tone-review"}`}>
            {verificationResolved}/{verificationTotal}
          </span>
          <span className="stat-label">
            {verificationCurrent ? "✓ citations resolved" : "⚠ checked against a different commit"}
          </span>
        </div>
        <div className="stat">
          <span className="stat-num">{CLAIMS.length}</span>
          <span className="stat-label">
            claims · {observed} observed{inferred ? `, ${inferred} inferred` : ""}
          </span>
        </div>
        <div className="stat">
          <span className="stat-num">{FILES.size}</span>
          <span className="stat-label">files & directories cited</span>
        </div>
        <div className="stat">
          <span className="stat-num mono">{SHORT_COMMIT}</span>
          <span className="stat-label">
            {verificationCheckedAt ? `checked ${new Date(verificationCheckedAt).toLocaleString()}` : "not yet checked"}
          </span>
        </div>
      </div>

      <section className="ledger-how">
        <h2 className="section-title">What “verified” means</h2>
        <ol className="how-list">
          <li>
            <span className="how-num mono">01</span>
            <span>
              <strong>Path exists.</strong> Each cited path is read with <code>git show {SHORT_COMMIT}:&lt;path&gt;</code>.
            </span>
          </li>
          <li>
            <span className="how-num mono">02</span>
            <span>
              <strong>Lines exist.</strong> Each line range must fall inside the file at that commit.
            </span>
          </li>
          <li>
            <span className="how-num mono">03</span>
            <span>
              <strong>You check the meaning.</strong> Verification proves the citation is real, not that the claim reads
              it correctly — which is why every claim opens its source.
              <Tag tone="review">YOUR JUDGEMENT</Tag>
            </span>
          </li>
        </ol>
      </section>

      <section className="ov-section">
        <div className="section-head">
          <h2 className="section-title">Cited files</h2>
          <label className="filter">
            <IconSearch size={14} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter paths…"
              aria-label="Filter cited files"
            />
          </label>
        </div>
        {shown.length === 0 ? (
          <EmptyState
            icon={<IconSearch size={20} />}
            title={`No cited path matches “${filter}”.`}
            body="The pack only cites files it made claims about. Try a shorter fragment, like “stripe” or “db/”."
          />
        ) : (
          <ul className="file-table">
            {shown.map((f) => (
              <li key={f.path}>
                <button className="file-row" onClick={() => open({ kind: "file", path: f.path })}>
                  {f.path.endsWith("/") ? <IconFolder size={14} /> : <IconFile size={14} />}
                  <code className="file-row-path">{f.path}</code>
                  <span className="file-row-bar" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, f.citations.length * 8)}%` }} />
                  </span>
                  <span className="file-row-count mono">{f.citations.length}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
