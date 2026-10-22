export {
  formatAcademicTitle,
  parseTerminology,
  parseTitlePolicy,
  DEFAULT_TITLE_POLICY,
} from '../../supabase/functions/_shared/academicTitle';
export type {
  TitleMode, StyleGuide, TitlePolicy, TitleResult, TermEntry, TermKind,
} from '../../supabase/functions/_shared/academicTitle';

const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();

function titleHeading(root: ParentNode): HTMLElement | null {
  return (root.querySelector('.ww-first-page h1') || root.querySelector('h1')) as HTMLElement | null;
}

/** Plain text of the title heading in a formatted article, or null when there is none. */
export function readFormattedTitle(html: string | null | undefined): string | null {
  if (!html) return null;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const h1 = titleHeading(tpl.content);
  return h1 ? (h1.textContent || '').replace(/\s+/g, ' ').trim() : null;
}

/**
 * Writes a new title into formatted article HTML: the title heading and any
 * citation line that repeats the old title. When the heading carries inline
 * markup (sub/sup/equations) and only letter case changes, the markup is kept
 * by re-casing characters in place.
 */
export function applyTitleToFormattedHtml(
  html: string,
  newText: string,
  newHtml: string,
  previousTitles: string[] = [],
): { html: string; markupReset: boolean } {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const h1 = titleHeading(tpl.content);
  let markupReset = false;
  const olds = new Set(previousTitles.map((t) => (t || '').replace(/\s+/g, ' ').trim()).filter(Boolean));

  if (h1) {
    const current = (h1.textContent || '').replace(/\s+/g, ' ').trim();
    if (current) olds.add(current);
    const onlySimpleMarkup = Array.from(h1.querySelectorAll('*')).every((el) => ['EM', 'I'].includes(el.tagName));
    if (onlySimpleMarkup) {
      h1.innerHTML = newHtml;
    } else if (squash(current) === squash(newText)) {
      const target = newText.replace(/\s+/g, '');
      let pos = 0;
      const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        const src = node.data;
        let out = '';
        for (const ch of src) {
          if (/\s/.test(ch)) { out += ch; continue; }
          out += target[pos] ?? ch;
          pos++;
        }
        node.data = out;
        node = walker.nextNode() as Text | null;
      }
    } else {
      h1.innerHTML = newHtml;
      markupReset = true;
    }
  }

  // Citation lines ("How to cite") repeat the title as plain text.
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (!h1 || !h1.contains(node)) {
      for (const old of olds) {
        if (old && old !== newText && node.data.includes(old)) node.data = node.data.split(old).join(newText);
      }
    }
    node = walker.nextNode() as Text | null;
  }
  return { html: tpl.innerHTML, markupReset };
}
