export const CC_BY_BADGE_URL = 'https://licensebuttons.net/l/by/4.0/88x31.png';

/** Builds the CC BY 4.0 licence block exactly as the formatter renders it (sidebar variant). */
export function ccLicenseBlockHtml(year: number | string, authors: string): string {
  const esc = (s: string) =>
    String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div class="ww-cc-license" style="margin-top:12px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:6px;padding:8px 10px;text-align:center;">
          <a href="https://creativecommons.org/licenses/by/4.0/"><img src="${CC_BY_BADGE_URL}" alt="Creative Commons Attribution 4.0 International License" style="width:88px;height:31px;display:inline-block;margin-bottom:6px;" /></a>
          <p style="font-size:8px;line-height:1.5;margin:0;color:#334155;text-align:justify;font-family:Arial,sans-serif;"><strong>Copyright:</strong> © ${year} ${esc(authors)}. Published by WWJMRD. This is an open-access article distributed under the terms of the Creative Commons Attribution 4.0 International License (CC BY 4.0) (https://creativecommons.org/licenses/by/4.0/), which permits unrestricted use, distribution, and reproduction in any medium, provided the original author and source are properly credited.</p>
        </div>`;
}

/**
 * Adds the CC BY 4.0 block to an already-formatted article without re-formatting it.
 * Inserted in the cover sidebar right below the "CONTACT US" box.
 */
export function injectCcLicenseIntoFormattedHtml(
  html: string,
  year: number | string,
  authors: string,
): { html: string; added: boolean } {
  if (!html) return { html, added: false };
  if (html.includes('ww-cc-license')) return { html, added: false };

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const innermost = (needle: string) =>
    Array.from(doc.querySelectorAll('div')).find((d) =>
      (d.textContent || '').includes(needle) &&
      !Array.from(d.querySelectorAll('div')).some((c) => (c.textContent || '').includes(needle)),
    );
  // The CONTACT US heading is a nested div — take its parent card.
  const contactHeading = innermost('CONTACT US');
  const contactBox = contactHeading?.parentElement ?? null;
  const citeBox = innermost('HOW TO CITE THIS ARTICLE');

  const wrapper = doc.createElement('div');
  wrapper.innerHTML = ccLicenseBlockHtml(year, authors);
  const node = wrapper.firstElementChild;
  if (!node) return { html, added: false };

  if (contactBox && contactBox.parentElement) {
    contactBox.parentElement.insertBefore(node, contactBox.nextSibling);
  } else if (citeBox && citeBox.parentElement) {
    citeBox.parentElement.insertBefore(node, citeBox.nextSibling);
  } else {
    const bottom = doc.querySelector('.ww-cover-bottom') || doc.querySelector('.wwjmrd-article');
    if (!bottom) return { html, added: false };
    bottom.appendChild(node);
  }

  return { html: doc.body?.innerHTML || html, added: true };
}
