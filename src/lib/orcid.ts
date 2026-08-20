export const ORCID_LOGO_URL = 'https://orcid.org/sites/default/files/images/orcid_16x16.png';

/** Normalises an ORCID iD to the 0000-0000-0000-0000 shape when possible. */
export function normalizeOrcid(raw: string): string {
  const digits = (raw || '').replace(/https?:\/\/orcid\.org\//i, '').replace(/[^0-9Xx]/g, '');
  if (digits.length === 16) return (digits.match(/.{1,4}/g) || []).join('-').toUpperCase();
  return (raw || '').trim();
}

/** Inline ORCID badge (logo + linked iD) used inside the formatted article HTML. */
export function orcidBadgeHtml(rawId: string): string {
  const id = normalizeOrcid(rawId);
  if (!id) return '';
  return `<span class="ww-orcid" data-orcid="${id}" style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap;"><img src="${ORCID_LOGO_URL}" alt="ORCID iD" style="width:11px;height:11px;display:inline-block;vertical-align:middle;" /><a href="https://orcid.org/${id}" style="color:#a6ce39;text-decoration:none;font-size:9px;">${id}</a></span>`;
}

export interface OrcidAuthorEntry {
  index: number; // 1-based position matching the affiliation <sup>
  name: string;
  orcid: string;
}

/**
 * Injects ORCID badges into an already-formatted article HTML without re-formatting it.
 * Authors without an ORCID iD are skipped. Existing badges are left untouched.
 */
export function injectOrcidsIntoFormattedHtml(html: string, entries: OrcidAuthorEntry[]): { html: string; added: number } {
  const usable = entries.filter((e) => e.orcid && e.orcid.trim());
  if (!html || usable.length === 0) return { html, added: 0 };

  const doc = new DOMParser().parseFromString(html, 'text/html');
  // The affiliation block on the cover page: small grey paragraphs each starting with <sup>N</sup>
  const paras = Array.from(doc.querySelectorAll('p')).filter((p) => p.querySelector('sup'));
  let added = 0;

  for (const entry of usable) {
    const id = normalizeOrcid(entry.orcid);
    const target = paras.find((p) => (p.querySelector('sup')?.textContent || '').trim() === String(entry.index));
    const badge = orcidBadgeHtml(id);

    if (target) {
      if (target.innerHTML.toLowerCase().includes('orcid')) continue;
      target.innerHTML = `${target.innerHTML.replace(/[\s,;]+$/, '')}, ${badge}`;
      added++;
      continue;
    }

    // No affiliation line for this author (no designation) — add one to the affiliation block.
    const block = paras[0]?.parentElement || doc.querySelector('.wwjmrd-article');
    if (!block) continue;
    if (block.innerHTML.toLowerCase().includes(id.toLowerCase())) continue;
    const p = doc.createElement('p');
    p.innerHTML = `<sup>${entry.index}</sup> ${badge}`;
    block.appendChild(p);
    added++;
  }

  if (!added) return { html, added: 0 };
  const body = doc.body?.innerHTML;
  return { html: body || html, added };
}
