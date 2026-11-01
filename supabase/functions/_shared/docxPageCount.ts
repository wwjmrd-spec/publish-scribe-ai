// Shared, deterministic DOCX page counting used by the browser (submission
// forms) and edge functions (retry analysis). Works on the raw XML strings so
// it has no zip dependency.

export const MAX_REASONABLE_PAGE_COUNT = 500;

/** Single-spaced 12pt A4 manuscript page holds about this many words. */
const WORDS_PER_PAGE = 500;
/** Densest realistic page (small font, no figures) — a safe lower bound. */
const MAX_WORDS_PER_PAGE = 700;
/** A figure/image takes roughly this many words' worth of page space. */
const WORDS_PER_DRAWING = 170;

export function normalizePageCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    return rounded >= 1 && rounded <= MAX_REASONABLE_PAGE_COUNT ? rounded : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_REASONABLE_PAGE_COUNT ? parsed : null;
  }
  return null;
}

export function parseDocxMetadataPageCount(xml: string | null | undefined): number | null {
  if (!xml) return null;
  const match = xml.match(/<(?:\w+:)?Pages>(\d+)<\/(?:\w+:)?Pages>/i);
  return normalizePageCount(match?.[1] ?? null);
}

/**
 * Pages Word rendered at last save. A table row that crosses a page gets a
 * break marker in every cell, so markers inside one table count once.
 */
export function countRenderedDocxPages(xml: string | null | undefined): number | null {
  if (!xml) return null;
  let tablesWithBreaks = 0;
  const outsideTables = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (table) => {
    const rows = table.split(/<w:tr[\s>]/).slice(1);
    const rowsWithBreaks = rows.filter((row) => /<w:lastRenderedPageBreak\b/.test(row)).length;
    tablesWithBreaks += rowsWithBreaks;
    return "";
  });
  const breaks = (outsideTables.match(/<w:lastRenderedPageBreak\b/g) || []).length + tablesWithBreaks;
  return breaks > 0 ? normalizePageCount(breaks + 1) : null;
}

/** Hard page breaks typed by the author — the document has at least this many pages. */
export function countExplicitPageBreaks(xml: string | null | undefined): number {
  if (!xml) return 0;
  const hard = (xml.match(/<w:br\b[^>]*w:type="page"/g) || []).length;
  const before = (xml.match(/<w:pageBreakBefore(?:\s*\/>|\s+w:val="(?:1|true|on)")/g) || []).length;
  const sections = (xml.match(/<w:sectPr\b/g) || []).length;
  return hard + before + Math.max(0, sections - 1);
}

export function countDocxWords(xml: string | null | undefined): number {
  if (!xml) return 0;
  const texts = xml.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || [];
  const joined = texts.map((t) => t.replace(/<[^>]+>/g, "")).join(" ");
  return joined.split(/\s+/).filter(Boolean).length;
}

export function countDocxDrawings(xml: string | null | undefined): number {
  if (!xml) return 0;
  return (xml.match(/<w:drawing\b/g) || []).length + (xml.match(/<w:pict\b/g) || []).length;
}

export interface DocxPageCountDetails {
  pageCount: number | null;
  metadataPages: number | null;
  renderedPages: number | null;
  minimumPages: number;
  estimatedPages: number;
  words: number;
}

/**
 * Combines Word's saved page count, its rendered page markers and the amount
 * of text. Saved counts can be stale or missing (Google Docs, WPS, LibreOffice
 * exports), so the result is never lower than what the text/page breaks prove.
 */
export function resolveDocxPageCount(appXml: string | null | undefined, documentXml: string | null | undefined): DocxPageCountDetails {
  const metadataPages = parseDocxMetadataPageCount(appXml);
  const renderedPages = countRenderedDocxPages(documentXml);
  const words = countDocxWords(documentXml);
  const drawings = countDocxDrawings(documentXml);
  const minimumPages = Math.max(
    countExplicitPageBreaks(documentXml) + 1,
    words > 0 ? Math.ceil(words / MAX_WORDS_PER_PAGE) : 1,
  );
  const estimatedPages = Math.max(1, Math.ceil((words + drawings * WORDS_PER_DRAWING) / WORDS_PER_PAGE));

  let pageCount: number | null;
  const saved = metadataPages ?? renderedPages;
  if (saved && saved >= minimumPages) {
    // Word's own count at last save, consistent with the amount of text.
    pageCount = saved;
  } else if (saved) {
    // The saved count is provably stale (e.g. a template value left by another
    // editor), so fall back to the text-based estimate.
    pageCount = Math.max(estimatedPages, minimumPages, saved);
  } else if (words > 0 || drawings > 0) {
    pageCount = Math.max(estimatedPages, minimumPages);
  } else {
    pageCount = null;
  }

  return {
    pageCount: normalizePageCount(pageCount),
    metadataPages,
    renderedPages,
    minimumPages,
    estimatedPages,
    words,
  };
}

/**
 * The page count used for fees: the larger of what the author stated and what
 * was detected, so a manuscript is never under-counted.
 */
export function resolveSubmissionPageCount(declared: unknown, detected: unknown): number | null {
  const d = normalizePageCount(declared);
  const a = normalizePageCount(detected);
  if (d && a) return Math.max(d, a);
  return d ?? a;
}

/** 2-page free publication: only when the admin switch is on and the article has 1–2 pages. */
export function qualifiesForTwoPageFree(pageCount: unknown, twoPageFreeEnabled: boolean): boolean {
  if (!twoPageFreeEnabled) return false;
  const pages = normalizePageCount(pageCount);
  return pages !== null && pages <= 2;
}
