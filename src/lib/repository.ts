/**
 * Repository resolver — centralizes the mapping from a GitHub URL to an
 * available verified onboarding pack.
 *
 * Architecture:
 *   GitHub URL → validate/normalize → identify supported repo → load pack
 *
 * Today's implementation supports a single target repository (Skateshop).
 * The seam is here so that future pack generation can be wired in without
 * scattering `if (repo === "skateshop")` checks throughout the UI.
 */

// ---------------------------------------------------------------------------
// URL validation and normalization
// ---------------------------------------------------------------------------

export interface ParsedRepo {
  /** Normalized canonical form: "owner/repo" */
  slug: string;
  /** Reconstructed canonical GitHub URL */
  url: string;
}

export type ParseResult =
  | { ok: true; repo: ParsedRepo }
  | { ok: false; error: string };

/**
 * Accepts a GitHub repository URL and returns a normalized ParsedRepo or an
 * error message.
 *
 * Accepted forms:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/
 *   https://github.com/owner/repo.git
 *   github.com/owner/repo          (no scheme)
 */
export function parseGitHubUrl(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Please enter a GitHub repository URL." };
  }

  // Add scheme if missing so URL parsing works reliably.
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  if (parsed.hostname.toLowerCase() !== "github.com") {
    return {
      ok: false,
      error: "LegacyLens currently only supports GitHub repositories.",
    };
  }

  // pathname is e.g. "/owner/repo", "/owner/repo/", "/owner/repo.git"
  const segments = parsed.pathname
    .replace(/\.git\/?$/, "")
    .replace(/\/$/, "")
    .split("/")
    .filter(Boolean);

  if (segments.length < 2) {
    return {
      ok: false,
      error: 'Enter a full repository URL, e.g. "https://github.com/owner/repo".',
    };
  }

  const [owner, repo] = segments;
  const slug = `${owner}/${repo}`.toLowerCase();
  const url = `https://github.com/${owner}/${repo}`;

  return { ok: true, repo: { slug, url } };
}

// ---------------------------------------------------------------------------
// Pack resolver
// ---------------------------------------------------------------------------

/**
 * The single supported repository for this demo.
 * Maps to the verified Skateshop onboarding pack bundled at build time.
 */
export const SUPPORTED_REPO_SLUG = "sadmann7/skateshop";

/**
 * Returns true when the parsed repository matches the available verified pack.
 * All comparison is done on the normalized slug (lowercase owner/repo).
 */
export function isSupportedRepo(repo: ParsedRepo): boolean {
  return repo.slug === SUPPORTED_REPO_SLUG;
}
