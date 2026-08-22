export const CC_BY_BADGE_URL = 'https://licensebuttons.net/l/by/4.0/88x31.png';

/** Builds the CC BY 4.0 licence block exactly as the formatter renders it. */
export function ccLicenseBlockHtml(year: number | string, authors: string): string {
  const esc = (s: string) =>
    String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div class="ww-cc-license" style="margin-top:8px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:4px;padding:8px 12px;display:flex;align-items:flex-start;gap:10px;">
        <a href="https://creativecommons.org/licenses/by/4.0/" style="flex:0 0 auto;"><img src="${CC_BY_BADGE_URL}" alt="Creative Commons Attribution 4.0 International License" style="width:88px;height:31px;display:block;" /></a>
        <p style="font-size:8.5px;line-height:1.5;margin:0;color:#334155;text-align:justify;font-family:Arial,sans-serif;"><strong>Copyright:</strong> © ${year} ${esc(authors)}. Published by WWJMRD. This is an open-access article distributed under the terms of the Creative Commons Attribution 4.0 International License (CC BY 4.0) (https://creativecommons.org/licenses/by/4.0/), which permits unrestricted use, distribution, and reproduction in any medium, provided the original author and source are properly credited.</p>
      </div>`;
}

/**
 * Adds the CC BY 4.0 block to an already-formatted article without re-formatting it.
 * Inserted right after the "How to cite this article" box on the cover page.
 */
export function injectCcLicenseIntoFormattedHtml(
  html: string,
  year: number | string,
  authors: string,
): { html: string; added: boolean } {
  if (!html) return { html, added: false };
  if (html.includes('ww-cc-license')) return { html, added: false };

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const citeBox = Array.from(doc.querySelectorAll('div')).find((d) =>
    (d.textContent || '').includes('HOW TO CITE THIS ARTICLE') &&
    !Array.from(d.querySelectorAll('div')).some((c) => (c.textContent || '').includes('HOW TO CITE THIS ARTICLE')),
  );
  const wrapper = doc.createElement('div');
  wrapper.innerHTML = ccLicenseBlockHtml(year, authors);
  const node = wrapper.firstElementChild;
  if (!node) return { html, added: false };

  if (citeBox && citeBox.parentElement) {
    citeBox.parentElement.insertBefore(node, citeBox.nextSibling);
  } else {
    const bottom = doc.querySelector('.ww-cover-bottom') || doc.querySelector('.wwjmrd-article');
    if (!bottom) return { html, added: false };
    bottom.appendChild(node);
  }

  return { html: doc.body?.innerHTML || html, added: true };
}
