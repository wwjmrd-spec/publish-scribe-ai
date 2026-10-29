// Pure helpers that build the structured `authors` and `references` arrays sent
// to the WWJMRD publish_article API. No Deno/Node imports so the same code is
// unit-tested with vitest and run by the edge function.

export type WwjmrdAuthor = {
  first_name: string | null;
  last_name: string | null;
  author_name: string;
  author_role: "corresponding_author" | "co_author";
  email: string | null;
  affiliation: string | null;
  designation: string | null;
  orcid_id: string | null;
};

export type WwjmrdReference = {
  reference_text: string;
  doi: string | null;
  url: string | null;
};

export type MainAuthorSource = {
  /** Name as printed on the article (publication-form override or articles.author_name). */
  name: string | null | undefined;
  /** articles.author_affiliation */
  affiliation: string | null | undefined;
};

export type ProfileSource = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  affiliation?: string | null;
  orcid?: string | null;
} | null | undefined;

export type CoAuthorSource = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  affiliation?: string | null;
  orcid?: string | null;
};

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s : null;
};

const HONORIFIC = /^(dr|prof|professor|mr|mrs|ms|miss|er|sh|smt|shri)\.?$/i;

/** Split a full name into first/last; honorifics are dropped from the parts only. */
export function splitPersonName(full: string | null | undefined): { first: string | null; last: string | null } {
  const tokens = (clean(full) || "").split(" ").filter(Boolean);
  while (tokens.length > 1 && HONORIFIC.test(tokens[0])) tokens.shift();
  if (tokens.length === 0) return { first: null, last: null };
  if (tokens.length === 1) return { first: tokens[0], last: null };
  return { first: tokens.slice(0, -1).join(" "), last: tokens[tokens.length - 1] };
}

const nameKey = (n: string | null | undefined) =>
  (clean(n) || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t && !HONORIFIC.test(t))
    .sort()
    .join(" ");

/** True when the printed author name is the same person as the account profile. */
export function isSamePerson(printed: string | null | undefined, profile: ProfileSource): boolean {
  if (!profile) return false;
  const p = nameKey(printed);
  if (!p) return true; // no separate printed name → the account holder is the author
  const full = nameKey(profile.full_name);
  const parts = nameKey(`${profile.first_name || ""} ${profile.last_name || ""}`);
  return (!!full && full === p) || (!!parts && parts === p);
}

const ORCID_RE = /(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i;
const normalizeOrcid = (v: unknown): string | null => {
  const s = clean(v);
  if (!s) return null;
  const m = s.match(ORCID_RE);
  return m ? m[1].toUpperCase() : s;
};

const normalizeEmail = (v: unknown): string | null => {
  const s = clean(v);
  return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : null;
};

/**
 * Main/corresponding author first, then every co-author in saved order.
 * The main author's affiliation is never copied to co-authors.
 * No designation is captured anywhere in the app yet, so it is always null.
 */
export type BuildAuthorsOptions = {
  /** Admin's per-article choice; when false every email is sent as null. */
  includeEmails?: boolean;
  /** Main author's email as printed on the article (articles.author_email). */
  mainEmail?: string | null;
};

export function buildAuthors(
  main: MainAuthorSource,
  profile: ProfileSource,
  coAuthors: CoAuthorSource[],
  options: BuildAuthorsOptions = {},
): WwjmrdAuthor[] {
  const includeEmails = options.includeEmails ?? true;
  const authors: WwjmrdAuthor[] = [];
  const same = isSamePerson(main.name, profile);
  const mainName = clean(main.name) || (same ? clean(profile?.full_name) : null);

  if (mainName) {
    const split = splitPersonName(mainName);
    const useProfileParts = same && clean(profile?.first_name) && clean(profile?.last_name);
    authors.push({
      first_name: useProfileParts ? clean(profile?.first_name) : split.first,
      last_name: useProfileParts ? clean(profile?.last_name) : split.last,
      author_name: mainName,
      author_role: "corresponding_author",
      email: includeEmails
        ? normalizeEmail(options.mainEmail) || (same ? normalizeEmail(profile?.email) : null)
        : null,
      affiliation: clean(main.affiliation) || (same ? clean(profile?.affiliation) : null),
      designation: null,
      // The app stores the main author's ORCID on the submitting profile
      // (Update Author Details writes it there), so it is used as-is.
      orcid_id: normalizeOrcid(profile?.orcid),
    });
  }

  for (const c of coAuthors || []) {
    const first = clean(c.first_name);
    const last = clean(c.last_name);
    const fullName = clean(c.name) || clean(`${first || ""} ${last || ""}`);
    if (!fullName) continue;
    const split = first || last ? { first, last } : splitPersonName(fullName);
    authors.push({
      first_name: split.first,
      last_name: split.last,
      author_name: fullName,
      author_role: "co_author",
      email: includeEmails ? normalizeEmail(c.email) : null,
      affiliation: clean(c.affiliation),
      designation: null,
      orcid_id: normalizeOrcid(c.orcid),
    });
  }
  return authors;
}

// ---------------------------------------------------------------- references

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", shy: "",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const stripTags = (html: string) =>
  decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const REF_HEADING_TEXT = /^(references?|bibliography|works cited|literature cited|reference list)\s*:?$/i;

/** Remove leading list numbering such as "12.", "[12]", "12)" left in edited text. */
const stripNumbering = (s: string) => s.replace(/^\s*(?:\[\d{1,4}\]|\(\d{1,4}\)|\d{1,4}[.)])\s*/, "").trim();

function itemsFromBlocks(html: string): string[] {
  const marked = html
    .replace(/\s+/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|ol|ul|section|article|blockquote)>/gi, "\n");
  return marked
    .split("\n")
    .map((part) => stripNumbering(stripTags(part)))
    .filter((t) => t.length > 0 && !REF_HEADING_TEXT.test(t));
}

/** Extract the saved reference list (in order) from formatted article HTML. */
export function extractReferenceTexts(html: string | null | undefined): string[] {
  if (!html) return [];
  let src = String(html);
  // Drop the editor's page-number overlay and heavy/irrelevant nodes.
  const overlay = src.search(/<div[^>]*id=["']ww-page-num-overlay["']/i);
  if (overlay >= 0) src = src.slice(0, overlay);
  src = src
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " ");

  // 1) The formatter's own list: <ol class="ww-references"><li>…</li></ol> (last one wins).
  const olRe = /<ol\b[^>]*class=["'][^"']*\bww-references\b[^"']*["'][^>]*>([\s\S]*?)<\/ol>/gi;
  let lastOl: string | null = null;
  for (const m of src.matchAll(olRe)) lastOl = m[1];
  if (lastOl !== null) {
    const items = [...lastOl.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((m) => stripNumbering(stripTags(m[1])))
      .filter(Boolean);
    if (items.length) return items;
  }

  // 2) Edited content: a "References" heading followed by one block per reference.
  // Inner content may hold inline tags only, so an outer wrapper <div> never
  // swallows the heading inside it.
  const headingRe = /<(h[1-6]|p|div|strong|b)\b[^>]*>((?:(?!<\/?(?:h[1-6]|p|div|section|ol|ul|li|table)\b)[\s\S])*?)<\/\1>/gi;
  let start = -1;
  for (const m of src.matchAll(headingRe)) {
    const text = stripTags(m[2]);
    const isRefClass = /class=["'][^"']*ww-references-h/i.test(m[0]);
    if ((isRefClass || /^h/i.test(m[1]) || text.length < 30) && REF_HEADING_TEXT.test(text)) {
      start = (m.index ?? 0) + m[0].length;
    }
  }
  if (start < 0) return [];
  let tail = src.slice(start);
  // Stop at the next real section heading (e.g. Appendix), the end of the page
  // section, or the journal's own page chrome (licence box, cover footer).
  const next = tail.search(/<h[1-6]\b|<\/section>|<!--|<[a-z][^>]*class=["'][^"']*\b(?:ww-cc-license|ww-cover-bottom|ww-footer)\b/i);
  if (next >= 0) tail = tail.slice(0, next);
  return itemsFromBlocks(tail);
}

const DOI_RE = /\b(10\.\d{3,9}(?:\.\d+)*\/[^\s"'<>]+)/i;
const URL_RE = /\bhttps?:\/\/[^\s"'<>]+/i;
const trimTrailing = (s: string) => s.replace(/[.,;:)\]}>]+$/, "");

export function parseReference(text: string): WwjmrdReference {
  const reference_text = text.trim();
  const urlMatch = reference_text.match(URL_RE);
  const url = urlMatch ? trimTrailing(urlMatch[0]) : null;
  let doi: string | null = null;
  const doiMatch = reference_text.match(DOI_RE);
  if (doiMatch) {
    try {
      doi = trimTrailing(decodeURIComponent(doiMatch[1]));
    } catch {
      doi = trimTrailing(doiMatch[1]);
    }
  }
  return {
    reference_text,
    doi,
    // Prefer the link written in the reference; otherwise the DOI's resolver link.
    url: url || (doi ? `https://doi.org/${doi}` : null),
  };
}

export function buildReferences(formattedHtml: string | null | undefined): WwjmrdReference[] {
  return extractReferenceTexts(formattedHtml).map(parseReference);
}

// ---------------------------------------------------------------- monthly order

export type PublishedArticleRow = {
  id: string;
  issue?: string | null;
  volume?: string | null;
  publication_year?: string | null;
  published_to_wwjmrd_at?: string | null;
  wwjmrd_article_id?: number | null;
};

/**
 * "YYYY-MM" publication month of an article: issue NN = month NN, the year
 * from publication_year (or volume N = 2014 + N), falling back to the date it
 * was published to WWJMRD.
 */
export function publicationMonthKey(row: PublishedArticleRow): string | null {
  const issue = parseInt(String(row.issue ?? "").trim(), 10);
  let month = issue >= 1 && issue <= 12 ? issue : NaN;
  let year = parseInt(String(row.publication_year ?? "").trim(), 10);
  if (!(year > 1900)) {
    const vol = parseInt(String(row.volume ?? "").trim(), 10);
    if (vol >= 1) year = 2014 + vol;
  }
  const d = row.published_to_wwjmrd_at ? new Date(row.published_to_wwjmrd_at) : null;
  const validDate = d && !Number.isNaN(d.getTime());
  if (!Number.isFinite(month) && validDate) month = d!.getUTCMonth() + 1;
  if (!(year > 1900) && validDate) year = d!.getUTCFullYear();
  if (!Number.isFinite(month) || !(year > 1900)) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Order of an article within its publication month: 1 for the first article
 * published in that month, 2 for the second, and so on. An article that is
 * already published keeps its own position; a new one goes after the others.
 */
export function computeMonthlyOrder(
  monthKey: string,
  articleId: string,
  published: PublishedArticleRow[],
): number {
  const time = (r: PublishedArticleRow) => {
    const t = r.published_to_wwjmrd_at ? new Date(r.published_to_wwjmrd_at).getTime() : NaN;
    return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
  };
  const sameMonth = published
    .filter((r) => publicationMonthKey(r) === monthKey)
    .sort((a, b) => time(a) - time(b) || Number(a.wwjmrd_article_id ?? 0) - Number(b.wwjmrd_article_id ?? 0));
  const own = sameMonth.findIndex((r) => r.id === articleId);
  return own >= 0 ? own + 1 : sameMonth.length + 1;
}
