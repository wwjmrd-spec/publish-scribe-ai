/**
 * Inject the DOI into an already-formatted article HTML string, without
 * re-formatting the whole article.
 *
 * Placement matches the formatter:
 *  - top meta line:  DOI: 10.67967/wwjmrd.0341 | Volume 12 | Issue 08 | August-2026 | Pages 27-112
 *  - citation box:   ... 12(08): 27-112. DOI: 10.67967/wwjmrd.0341
 *
 * Returns { html, added } — added=false when no DOI given or it is already there.
 */
export function injectDoiIntoFormattedHtml(
  html: string,
  doi: string,
): { html: string; added: boolean } {
  const clean = (doi || '').trim();
  if (!clean) return { html, added: false };
  if (html.includes('ww-doi-line') || html.includes('ww-doi-cite')) {
    return { html, added: false };
  }

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const doiText = `DOI: ${esc(clean)}`;

  let out = html;
  let added = false;

  // 1. Top meta line — prefix the "Volume … | Issue …" span.
  const headerRe = /(<span[^>]*>)(\s*Volume\s)/i;
  if (headerRe.test(out)) {
    out = out.replace(
      headerRe,
      (_m, open: string, rest: string) =>
        `${open}<span class="ww-doi-line">${doiText}</span> |${rest}`,
    );
    added = true;
  }

  // 2. "How to cite this article" — append after the page range.
  const citeRe = /(<span class="ww-page-range">[^<]*<\/span>\s*\.)(\s*<\/p>)/i;
  if (citeRe.test(out)) {
    out = out.replace(
      citeRe,
      (_m, before: string, after: string) =>
        `${before} <span class="ww-doi-cite">${doiText}</span>${after}`,
    );
    added = true;
  }

  // 3. Fallback for older layouts without the meta/citation markers:
  //    put a DOI line right after the cover title.
  if (!added) {
    const idx = out.search(/<\/h1>/i);
    if (idx === -1) return { html, added: false };
    const insertAt = idx + '</h1>'.length;
    const doiLine =
      `<p class="ww-doi-line" style="font-family:Arial,sans-serif;font-size:9.5px;color:#334155;margin:0 0 8px;">` +
      `<strong style="color:#1e3a8a;letter-spacing:0.5px;">DOI:</strong> ` +
      `<a href="https://doi.org/${esc(clean)}" style="color:#1e3a8a;text-decoration:none;">https://doi.org/${esc(clean)}</a></p>`;
    return { html: out.slice(0, insertAt) + doiLine + out.slice(insertAt), added: true };
  }

  return { html: out, added };
}
