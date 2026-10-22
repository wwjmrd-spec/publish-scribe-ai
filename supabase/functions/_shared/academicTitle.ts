// Academic title capitalization (Title Case / Sentence case / Preserve / journal policy).
// Pure, dependency-free TypeScript shared by the browser and edge functions.
//
// Safety guarantee: the output differs from the input ONLY in letter case and
// whitespace. Spelling, punctuation, symbols, digits and word order never change.
// If that guarantee would ever be broken, the original title is returned.

import { builtinTerms, type TermEntry, type TermKind } from "./academicTerms.ts";

export type { TermEntry, TermKind };
export type TitleMode = "title" | "sentence" | "preserve" | "custom";
export type StyleGuide = "apa" | "chicago" | "vancouver";

export interface TitlePolicy {
  base: "title" | "sentence";
  styleGuide: StyleGuide;
  /** Extra words the journal always keeps lowercase (unless first in the title or subtitle). */
  extraLowercase: string[];
}

export const DEFAULT_TITLE_POLICY: TitlePolicy = {
  base: "title",
  styleGuide: "chicago",
  extraLowercase: ["so", "yet", "vs", "versus", "via", "per", "than", "et", "al"],
};

export interface TitleOptions {
  mode: TitleMode;
  styleGuide?: StyleGuide;
  policy?: Partial<TitlePolicy> | null;
  /** Journal and AI-suggested terms, added to the built-in dictionary. */
  terms?: TermEntry[];
}

export interface TitleChange { from: string; to: string; kind: "capitalization" | "nomenclature" }
export interface TitleFlag { term: string; message: string }

export interface TitleResult {
  text: string;
  /** Escaped HTML; scientific names wrapped in <em>. */
  html: string;
  changes: TitleChange[];
  flags: TitleFlag[];
  mode: TitleMode;
  styleGuide: StyleGuide;
  base: "title" | "sentence" | "preserve";
}

// ---------- word lists ----------

const ARTICLES = ["a", "an", "the"];
const APA_MINOR = new Set([...ARTICLES, "and", "as", "but", "for", "if", "nor", "or", "so", "yet", "at", "by", "in", "of", "off", "on", "per", "to", "up", "via"]);
const PREPOSITIONS = [
  "about", "above", "across", "after", "against", "along", "amid", "among", "amongst", "around", "as", "at", "before",
  "behind", "below", "beneath", "beside", "besides", "between", "beyond", "by", "concerning", "despite", "down",
  "during", "except", "for", "from", "in", "inside", "into", "like", "near", "of", "off", "on", "onto", "out",
  "outside", "over", "past", "per", "regarding", "since", "through", "throughout", "till", "to", "toward", "towards",
  "under", "underneath", "unlike", "until", "up", "upon", "versus", "via", "with", "within", "without",
];
const CHICAGO_MINOR = new Set([...ARTICLES, "and", "but", "for", "or", "nor", ...PREPOSITIONS]);
const HYPHEN_PREFIXES = new Set(["anti", "non", "pre", "post", "re", "co", "sub", "inter", "intra", "multi", "semi", "pro", "un", "mid", "over", "under", "counter", "extra", "infra", "ultra", "micro", "macro", "bio", "neo", "pseudo"]);
const RANK_MARKERS = new Set(["subsp", "ssp", "var", "f"]);
const ROMAN = /^(?=[MDCLXVI]{2,}$)M*(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/;

// ---------- settings helpers ----------

export function parseTitlePolicy(raw: unknown): TitlePolicy {
  try {
    const v: any = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!v || typeof v !== "object") return { ...DEFAULT_TITLE_POLICY };
    return {
      base: v.base === "sentence" ? "sentence" : "title",
      styleGuide: v.styleGuide === "apa" || v.styleGuide === "vancouver" ? v.styleGuide : "chicago",
      extraLowercase: Array.isArray(v.extraLowercase)
        ? v.extraLowercase.map((w: unknown) => String(w).trim().toLowerCase()).filter(Boolean).slice(0, 200)
        : [...DEFAULT_TITLE_POLICY.extraLowercase],
    };
  } catch {
    return { ...DEFAULT_TITLE_POLICY };
  }
}

const KINDS: TermKind[] = ["acronym", "proper", "brand", "species", "genus", "term"];

export function parseTerminology(raw: unknown, source: TermEntry["source"] = "journal"): TermEntry[] {
  try {
    const v: any = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(v)) return [];
    const out: TermEntry[] = [];
    for (const e of v.slice(0, 2000)) {
      const form = String(e?.form ?? "").trim().replace(/\s+/g, " ");
      if (!form || form.length > 120) continue;
      const kind: TermKind = KINDS.includes(e?.kind) ? e.kind : "term";
      out.push({ form, kind, italic: e?.italic === true || kind === "species" || kind === "genus", ambiguous: e?.ambiguous === true, source });
    }
    return out;
  } catch {
    return [];
  }
}

// ---------- dictionary index ----------

interface IndexedTerm extends TermEntry { words: string[] }

const BUILTIN = builtinTerms();

function withAbbreviations(list: TermEntry[]): TermEntry[] {
  const out = [...list];
  for (const t of list) {
    if (t.kind !== "species") continue;
    const [genus, epithet, ...rest] = t.form.split(" ");
    if (!genus || !epithet || rest.length) continue;
    out.push({ form: `${genus[0]}. ${epithet}`, kind: "species", italic: true, ambiguous: t.ambiguous, source: t.source });
  }
  return out;
}

function buildIndex(extra: TermEntry[] = []) {
  // Later entries win, so journal/AI terms override built-ins with the same spelling.
  const byForm = new Map<string, IndexedTerm>();
  for (const t of withAbbreviations([...BUILTIN, ...extra])) {
    const words = t.form.split(" ").filter(Boolean);
    byForm.set(words.join(" ").toLowerCase(), { ...t, words });
  }
  const byFirst = new Map<string, IndexedTerm[]>();
  for (const t of byForm.values()) {
    const k = t.words[0].toLowerCase();
    const arr = byFirst.get(k) || [];
    arr.push(t);
    byFirst.set(k, arr);
  }
  for (const arr of byFirst.values()) arr.sort((a, b) => b.words.length - a.words.length);
  return byFirst;
}

// ---------- tokenization ----------

interface Token { lead: string; core: string; trail: string }

const LEAD_RE = /^[(\[{"'“‘«¿¡]+/;
const TRAIL_RE = /[)\]}"'”’»,;:.!?]+$/;

function tokenize(text: string): Token[] {
  return text.trim().split(/\s+/).filter(Boolean).map((raw) => {
    const lead = raw.match(LEAD_RE)?.[0] ?? "";
    let rest = raw.slice(lead.length);
    const trail = rest.match(TRAIL_RE)?.[0] ?? "";
    rest = rest.slice(0, rest.length - trail.length);
    if (!rest) return { lead: "", core: raw, trail: "" }; // pure punctuation / dash
    return { lead, core: rest, trail };
  });
}

/** Lowercase lookup key; abbreviations like "E." keep their dot. */
function keyOf(tok: Token, withDot: boolean): string {
  return tok.core.toLowerCase() + (withDot && tok.trail.startsWith(".") ? "." : "");
}

function exactOf(tok: Token, withDot: boolean): string {
  return tok.core + (withDot && tok.trail.startsWith(".") ? "." : "");
}

const isWordy = (s: string) => /[A-Za-z]/.test(s);

// ---------- main ----------

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export function formatAcademicTitle(input: string, opts: TitleOptions): TitleResult {
  const policy = { ...DEFAULT_TITLE_POLICY, ...parseTitlePolicy(opts.policy ?? DEFAULT_TITLE_POLICY) };
  const mode = opts.mode;
  const guide: StyleGuide = mode === "custom" ? policy.styleGuide : (opts.styleGuide || "apa");
  const base: TitleResult["base"] = mode === "preserve" ? "preserve" : mode === "custom" ? policy.base : mode;
  const minor = new Set<string>(guide === "apa" ? APA_MINOR : CHICAGO_MINOR);
  if (mode === "custom") for (const w of policy.extraLowercase) minor.add(w);

  const source = (input || "").replace(/\s+/g, " ").trim();
  const tokens = tokenize(source);
  const index = buildIndex(opts.terms || []);
  const changes: TitleChange[] = [];
  const flags: TitleFlag[] = [];
  const lowercasedCapitals: string[] = [];

  const letters = source.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  const wordCount = tokens.filter((t) => isWordy(t.core)).length;
  const allCapsTitle = letters.length >= 8 && wordCount >= 3 && upper / letters.length > 0.8;
  if (allCapsTitle && base !== "preserve") {
    flags.push({ term: "", message: "The title was written in capital letters, so abbreviations that are not in the term list may have been lowercased. Please check them." });
  }

  // Positions of subtitle starts and title/subtitle ends.
  const wordIdx = tokens.map((t, i) => (isWordy(t.core) ? i : -1)).filter((i) => i >= 0);
  const startSet = new Set<number>();
  const endSet = new Set<number>();
  if (wordIdx.length) { startSet.add(wordIdx[0]); endSet.add(wordIdx[wordIdx.length - 1]); }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const breaks = /[:?!]/.test(t.trail) || (!isWordy(t.core) && /^[—–-]+$/.test(t.core));
    if (!breaks) continue;
    const next = wordIdx.find((w) => w > i);
    if (next !== undefined) startSet.add(next);
    const prev = isWordy(t.core) ? i : [...wordIdx].reverse().find((w) => w < i);
    if (prev !== undefined) endSet.add(prev);
  }

  const outCores: string[] = tokens.map((t) => t.core);
  const htmlCores: string[] = tokens.map((t) => escapeHtml(t.core));
  const italicSpans: [number, number][] = [];
  const handled = new Set<number>();

  // 1) Dictionary phrases (longest match first).
  for (let i = 0; i < tokens.length; i++) {
    if (handled.has(i)) continue;
    const cands = [
      ...(index.get(keyOf(tokens[i], true)) || []),
      ...(keyOf(tokens[i], true) !== keyOf(tokens[i], false) ? index.get(keyOf(tokens[i], false)) || [] : []),
    ].sort((a, b) => b.words.length - a.words.length);
    for (const term of cands) {
      const n = term.words.length;
      if (i + n > tokens.length) continue;
      let ok = true;
      let exact = true;
      for (let k = 0; k < n; k++) {
        const tok = tokens[i + k];
        const w = term.words[k];
        const dot = w.endsWith(".");
        if (k > 0 && tok.lead) { ok = false; break; }
        if (k < n - 1 && tok.trail && !(dot && tok.trail === ".")) { ok = false; break; }
        if (keyOf(tok, dot) !== w.toLowerCase()) { ok = false; break; }
        if (exactOf(tok, dot) !== w) exact = false;
      }
      if (!ok) continue;
      if (term.ambiguous && !exact) {
        if ((term.kind === "genus" || term.kind === "species") && base !== "preserve") {
          const seen = tokens.slice(i, i + n).map((t) => t.core).join(" ");
          flags.push({ term: seen, message: `“${seen}” may be the scientific name ${term.form}. If so, write it as “${term.form}” in italics; it was left unchanged.` });
        }
        continue;
      }
      if (base === "preserve" && !exact) continue;
      for (let k = 0; k < n; k++) {
        const canon = term.words[k].replace(/\.$/, "");
        outCores[i + k] = canon;
        htmlCores[i + k] = escapeHtml(canon);
        handled.add(i + k);
      }
      if (term.italic) italicSpans.push([i, i + n - 1]);
      if (term.source === "ai" && !exact) {
        flags.push({ term: term.form, message: `“${term.form}” was recognised by the AI check. Please verify it.` });
      }
      const from = tokens.slice(i, i + n).map((t) => t.core).join(" ");
      const to = term.words.map((w) => w.replace(/\.$/, "")).join(" ");
      if (from !== to || term.italic) changes.push({ from, to, kind: term.italic ? "nomenclature" : "capitalization" });
      // Genus + sp./spp. and infraspecific ranks: keep the marker roman, italicize the epithet.
      const after = i + n;
      if (term.kind === "species" && tokens[after] && RANK_MARKERS.has(tokens[after].core.toLowerCase()) && tokens[after + 1] && /^[A-Za-z-]+$/.test(tokens[after + 1].core)) {
        if (base !== "preserve") {
          outCores[after] = tokens[after].core.toLowerCase();
          outCores[after + 1] = tokens[after + 1].core.toLowerCase();
        }
        htmlCores[after] = escapeHtml(outCores[after]);
        htmlCores[after + 1] = escapeHtml(outCores[after + 1]);
        italicSpans.push([after + 1, after + 1]);
        handled.add(after); handled.add(after + 1);
      } else if (term.kind === "genus" && tokens[after] && /^spp?$/i.test(tokens[after].core)) {
        if (base !== "preserve") outCores[after] = tokens[after].core.toLowerCase();
        htmlCores[after] = escapeHtml(outCores[after]);
        handled.add(after);
      }
      i += n - 1;
      break;
    }
  }

  // 2) Ordinary words.
  const singleLookup = (part: string): IndexedTerm | null => {
    const arr = index.get(part.toLowerCase());
    const hit = arr?.find((t) => t.words.length === 1);
    if (!hit) return null;
    if (hit.ambiguous && hit.words[0] !== part) return null;
    return hit;
  };

  const casePart = (part: string, capitalize: boolean, keepIfCapitalized: boolean): string => {
    if (!isWordy(part)) return part;
    if (/\d/.test(part)) return part; // strain IDs, formulas, years
    if (!/^[A-Za-z]/.test(part)) return part; // Greek letters, symbols
    if (part === "I") return part;
    const allCaps = part.length >= 2 && part === part.toUpperCase();
    if (allCaps && (!allCapsTitle || ROMAN.test(part))) return part; // acronym / roman numeral
    if (!allCaps && /[a-z][A-Z]|^[A-Z]{2,}[a-z]/.test(part)) return part; // mixed case: mRNA, iPhone, McKay
    if (/^[A-Z][a-z]?$/.test(part) && part.length === 1 && !capitalize && part !== "A") return part; // single letters like "T" cells
    const lower = part.toLowerCase();
    if (capitalize) return upperFirst(lower);
    if (keepIfCapitalized && /^[A-Z]/.test(part)) return part;
    return lower;
  };

  for (let i = 0; i < tokens.length; i++) {
    if (handled.has(i)) continue;
    const tok = tokens[i];
    if (!isWordy(tok.core)) continue;
    if (base === "preserve") continue;
    const pieces = tok.core.split(/([-/–])/);
    const isStart = startSet.has(i);
    const isEnd = endSet.has(i);
    const outPieces: string[] = [];
    const htmlPieces: string[] = [];
    let firstPart = "";
    for (let p = 0; p < pieces.length; p++) {
      const part = pieces[p];
      if (p % 2 === 1) { outPieces.push(part); htmlPieces.push(escapeHtml(part)); continue; }
      const hit = part ? singleLookup(part) : null;
      if (hit) {
        outPieces.push(hit.words[0]);
        htmlPieces.push(hit.italic ? `<em>${escapeHtml(hit.words[0])}</em>` : escapeHtml(hit.words[0]));
        if (hit.words[0] !== part) changes.push({ from: part, to: hit.words[0], kind: hit.italic ? "nomenclature" : "capitalization" });
        if (p === 0) firstPart = part;
        continue;
      }
      const lower = part.toLowerCase();
      const isFirstPiece = p === 0;
      let capitalize: boolean;
      if (base === "title") {
        if (isFirstPiece) {
          capitalize = isStart || (isEnd && guide !== "apa") || !minor.has(lower);
        } else {
          const prev = firstPart.toLowerCase();
          const afterChemPrefix = firstPart.length === 1 || !/^[A-Za-z]/.test(firstPart);
          if (afterChemPrefix) { outPieces.push(part); htmlPieces.push(escapeHtml(part)); continue; }
          if (guide !== "apa" && HYPHEN_PREFIXES.has(prev)) capitalize = false;
          else capitalize = !minor.has(lower) || (isEnd && p === pieces.length - 1 && guide !== "apa");
        }
      } else {
        const subtitleCap = guide !== "vancouver";
        capitalize = isFirstPiece && isStart && (i === wordIdx[0] || subtitleCap);
      }
      const cased = casePart(part, capitalize, false);
      if (base === "sentence" && !capitalize && cased !== part && /^[A-Z][a-z]/.test(part) && !allCapsTitle) {
        lowercasedCapitals.push(part);
      }
      if (isFirstPiece) firstPart = part;
      outPieces.push(cased);
      htmlPieces.push(escapeHtml(cased));
    }
    const out = outPieces.join("");
    if (out !== tok.core) changes.push({ from: tok.core, to: out, kind: "capitalization" });
    outCores[i] = out;
    htmlCores[i] = htmlPieces.join("");
  }

  if (lowercasedCapitals.length) {
    const uniq = [...new Set(lowercasedCapitals)];
    flags.push({ term: uniq.join(", "), message: `These words were made lowercase: ${uniq.join(", ")}. If any of them is a name (a person, place or organisation), keep it capitalized.` });
  }

  // Build output.
  const italicStart = new Map<number, number>();
  for (const [s, e] of italicSpans) italicStart.set(s, e);
  const textParts: string[] = [];
  const htmlParts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    textParts.push(t.lead + outCores[i] + t.trail);
    const end = italicStart.get(i);
    if (end !== undefined) {
      let inner = escapeHtml(t.lead) + "<em>";
      for (let k = i; k <= end; k++) {
        if (k > i) inner += " " + escapeHtml(tokens[k].lead);
        inner += htmlCores[k];
        if (k < end) inner += escapeHtml(tokens[k].trail);
        else inner += "</em>" + escapeHtml(tokens[k].trail);
        if (k > i) textParts.push(tokens[k].lead + outCores[k] + tokens[k].trail);
      }
      htmlParts.push(inner);
      i = end;
      continue;
    }
    htmlParts.push(escapeHtml(t.lead) + htmlCores[i] + escapeHtml(t.trail));
  }
  const text = textParts.join(" ");
  const html = htmlParts.join(" ");

  if (squash(text) !== squash(source)) {
    return {
      text: source, html: escapeHtml(source), changes: [], mode, styleGuide: guide, base,
      flags: [{ term: "", message: "The title could not be re-capitalized safely, so it was left as written." }],
    };
  }

  return { text, html, changes: base === "preserve" ? [] : changes, flags, mode, styleGuide: guide, base };
}
