export const CC_BY_BADGE_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFgAAAAfCAMAAABUFvrSAAAAAXNSR0IB2cksfwAAAARnQU1BAACxjnz7UZMAAAAgY0hSTQAAeiUAAICDAAD5/wAAgOkAAHUwAADqYAAAOpgAABdvkl/FRgAAAW5QTFRFAAAAAAAA////////////7+/v39/f1tXV09bS0tXS0tXR0dTR0dTQ0NTQ0NPPz9PPztLOztHNzdHNzdHMz8/PzdDMzNDMzNDLzM/Ly8/Ly8/Ky87Kys3Jyc3Jyc3IyMzIyMzHx8vHxsrGxsrFxcnFxcnExMnExMjDw8jDxMfDw8fCwsfCwcXAwMXAwMW/wMS/v8S+v8O+vsO+vsK9vcK9vcK8v7+/vMG8vMG7vMC8u8C7u8C6ur+6ur+5ub65ub64uL23t7y2tru1tbq0tLqztLmzs7iysrixsrexsbewsbawsLavsLWvr7Wur7SusLOvrrStrrOtr7KvrbOsrLKrr6+vq7Gqn6OenqCdn5+flpmWk5iTkZSRkZORj4+PiYyJhIaEhIWEgoWCgICAfX98fH98eXx5cHJvcHBwYGBgXV5dUFFQUFBQQ0RDQEBAPj8+NTY1MjMxMDAwKSkpKCkoICAgGxsbEBAQDg4ODQ4N2y3MbAAAAAR0Uk5T/wAKDnDBpeYAAALVSURBVHjatZX9V9JgFMdvNQh1Tme2zU1othSl5WsQZoqIrxmmqaUpqS2JKczibfLfd5+hHCYybB6/B859ftg+5+57Xx54Ag+iR/hPxGPRSXVYkf2SwHGC2C8rQXUiOhdPLK992tze3vn6/wKLOxseCykBkWXoNp+vrYNh+wJKaDQ8S8jJze0dl2TkvgkOSCx9kqsAqpI7prtFeUh9i+SV9eRWY8rpAqAKaWdwDLkyz6TKUFP5kOECg2p4Lr60ut6Q8kERwMhkDIDigRM4OhaUOfocT6auRSKabuLxfORZYGg0GltAM26k/O0Ssl4K5c3C5YEDeDI0wBOuqXmoqvYRXRzh5NDEzHwCU7aDi6DjMwDkQSg6gFVFYpCb91I1efKYMyMqahhT/rhh8yIN2adVMCoL6ebg4RdsCrmYrp182B0Ijs/EF1eTW/XgAtRl4IVCc7Ai0mUweymbPCaU6T5FfRdLrNi9AINC6QA6iQY0B8s9JwCanUvsg2NWDk3Nohd2cIZCAYrEjAPY35UDE42IZA1Dq4Yf+IoJOaafeLG0tuEOLNEV0BEIRMauFXTysZUOcXD0/fziWtKdFUI7AKaYh5I3UtrPY3vslvYtL9oERY1iwyG4oXgALYvH+wAiFGX5XAvWF/i4l41gbDfKod3cgu0DksEBuYsVnt6ShlaQ0GCF00g7F++qaleBZFOhpcbiEXIRIK9n8q2WkL/rHEyq1m67hhWoErabPzj+odpubtam3JNCL24fkNdTcwvLZPLcLPpX1kh7HUbaJRiX0N5tSyjFBoYncPDIEnIFhlOJOUNy3RryWmtT+gn31G+hs37RezQT4A/Nn8K99YvrPLtxNdHPv0MzVeeDHFqTBWav/jJNMXxzLlBXP+oubkgsnbq+/g9pVnLy4Xptwl3094vY00W3+3ztNMP2fb4AB9mMaK2Lo2lJ4HlBmj4iWLcZP7wePwz20T8rQcP0CuFIbQAAAABJRU5ErkJggg==';

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
