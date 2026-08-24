/**
 * Inject a DOI line into an already-formatted article HTML string,
 * without re-formatting the whole article. The line is placed directly
 * after the article title (the first </h1> on the cover page).
 *
 * Returns { html, added } — added=false when no DOI given or a DOI line
 * is already present.
 */
export function injectDoiIntoFormattedHtml(
  html: string,
  doi: string,
): { html: string; added: boolean } {
  const clean = (doi || '').trim();
  if (!clean) return { html, added: false };
  if (html.includes('ww-doi-line') || html.includes(`doi.org/${clean}`)) {
    return { html, added: false };
  }

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const doiLine =
    `<p class="ww-doi-line" style="font-family:Arial,sans-serif;font-size:9.5px;color:#334155;margin:0 0 8px;">` +
    `<strong style="color:#1e3a8a;letter-spacing:0.5px;">DOI:</strong> ` +
    `<a href="https://doi.org/${esc(clean)}" style="color:#1e3a8a;text-decoration:none;">https://doi.org/${esc(clean)}</a></p>`;

  // Insert after the first closing </h1> (the cover-page title).
  const idx = html.search(/<\/h1>/i);
  if (idx === -1) return { html, added: false };
  const insertAt = idx + '</h1>'.length;
  return { html: html.slice(0, insertAt) + doiLine + html.slice(insertAt), added: true };
}
