import type { Overview } from "@/src/types/pack";

interface Props {
  overview: Overview;
}

function Badge({ basis }: { basis: "observed" | "inferred" }) {
  return (
    <span className={`badge badge--${basis}`}>
      {basis === "observed" ? "Observed" : "Inferred"}
    </span>
  );
}

function EvidenceLink({ path, lines, note }: { path: string; lines?: [number, number]; note?: string }) {
  const label = lines ? `${path}:${lines[0]}-${lines[1]}` : path;
  const title = note ?? label;
  return (
    <a
      className="evidence-link"
      href={`#evidence`}
      title={title}
      onClick={(e) => e.preventDefault()}
    >
      {label}
    </a>
  );
}

function ClaimList({ title, claims }: { title: string; claims: Overview["stack"] }) {
  return (
    <section className="claim-section">
      <h2 className="section-title">{title}</h2>
      <ul className="claim-list">
        {claims.map((claim, i) => (
          <li key={i} className="claim-item">
            <div className="claim-header">
              <span className="claim-text">{claim.text}</span>
              <Badge basis={claim.basis} />
            </div>
            {claim.evidence.length > 0 && (
              <div className="claim-evidence">
                {claim.evidence.map((ev, j) => (
                  <EvidenceLink key={j} {...ev} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function OverviewScreen({ overview }: Props) {
  const verificationCount =
    overview.stack.reduce((acc, c) => acc + c.evidence.length, 0) +
    overview.entryPoints.reduce((acc, c) => acc + c.evidence.length, 0) +
    overview.keyFacts.reduce((acc, c) => acc + c.evidence.length, 0);

  return (
    <div className="overview">
      <div className="overview-hero">
        <p className="one-line">{overview.oneLine}</p>
        {verificationCount > 0 && (
          <span className="verification-count">
            {verificationCount} evidence {verificationCount === 1 ? "link" : "links"}
          </span>
        )}
      </div>

      <ClaimList title="Stack" claims={overview.stack} />
      <ClaimList title="Entry Points" claims={overview.entryPoints} />
      <ClaimList title="Key Facts" claims={overview.keyFacts} />
    </div>
  );
}
