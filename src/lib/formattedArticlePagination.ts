const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_PADDING_MM = 15;
const CONTENT_WIDTH_MM = A4_WIDTH_MM - PAGE_PADDING_MM * 2;
const CONTENT_HEIGHT_MM = A4_HEIGHT_MM - PAGE_PADDING_MM * 2;
const BODY_HEADER_MM = 8;
const BODY_FOOTER_MM = 8;
const BODY_CONTENT_HEIGHT_MM = CONTENT_HEIGHT_MM - BODY_HEADER_MM - BODY_FOOTER_MM;
const MM_TO_PX = 96 / 25.4;

const waitForImages = async (root: ParentNode) => {
  const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          const timeout = window.setTimeout(() => resolve(), 2500);
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
          img.addEventListener('load', () => window.clearTimeout(timeout), { once: true });
          img.addEventListener('error', () => window.clearTimeout(timeout), { once: true });
        }),
    ),
  );
};

const absolutizeImages = (root: ParentNode) => {
  const origin = window.location.origin;
  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('/')) img.setAttribute('src', origin + src);
    if (!src.startsWith('data:')) (img as HTMLImageElement).crossOrigin = 'anonymous';
  });
};

const pageCss = `
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #525659; font-family: Georgia, 'Times New Roman', serif; }
    .formatted-a4-document { background: #525659; padding: 20px 0; }
    .formatted-a4-page { width: ${A4_WIDTH_MM}mm; min-height: ${A4_HEIGHT_MM}mm; height: ${A4_HEIGHT_MM}mm; margin: 0 auto 18px; padding: ${PAGE_PADDING_MM}mm; background: #fff; color: #0f172a; box-shadow: 0 5px 18px rgba(0,0,0,.32); overflow: hidden; page-break-after: always; break-after: page; position: relative; display: flex; flex-direction: column; }
    .formatted-a4-page:last-child { page-break-after: auto; break-after: auto; }
    .formatted-page-content { width: ${CONTENT_WIDTH_MM}mm; flex: 1; min-height: 0; }
    .formatted-cover-page .formatted-page-footer { margin-top: auto; }
    .formatted-body-page { display: flex; flex-direction: column; }
    .formatted-running-head { height: ${BODY_HEADER_MM}mm; border-bottom: 1px solid #cbd5e1; color: #475569; font-family: Arial, sans-serif; font-size: 9px; line-height: 5mm; }
    .formatted-body-content { width: ${CONTENT_WIDTH_MM}mm; height: ${BODY_CONTENT_HEIGHT_MM}mm; margin: 0 auto; padding-top: 4mm; overflow: hidden; font-size: 10.8px; line-height: 1.62; color: #1f2937; }
    .formatted-body-content h1, .formatted-body-content h2, .formatted-body-content h3 { font-family: Georgia, 'Times New Roman', serif; color: #0f172a; font-weight: 700; line-height: 1.25; margin: 12px 0 5px; }
    .formatted-body-content h1 { font-size: 14px; } .formatted-body-content h2 { font-size: 12.5px; } .formatted-body-content h3 { font-size: 11.5px; }
    .formatted-body-content p { text-align: justify; margin: 4px 0; }
    .formatted-body-content ul, .formatted-body-content ol { margin: 5px 0 6px 18px; padding: 0; }
    .formatted-body-content li { margin: 2px 0; text-align: justify; }
    .formatted-body-content figure, .formatted-body-content table, .ww-figure, .ww-data-table { break-inside: avoid; page-break-inside: avoid; }
    .formatted-body-content img { max-width: 100%; max-height: 210mm; height: auto; object-fit: contain; }
    .formatted-body-content table { border-collapse: collapse; width: 100%; margin: 9px 0 12px; table-layout: auto; }
    .formatted-body-content th, .formatted-body-content td { border: 1px solid #94a3b8; padding: 4px 5px; font-size: 9.2px; vertical-align: top; overflow-wrap: anywhere; }
    .formatted-body-content th { background: #e2e8f0; font-weight: 700; }
    .formatted-body-content .ww-references-materialized { font-size: 9.5px; line-height: 1.45; margin: 5px 0 6px; }
    .formatted-body-content .ww-reference-item { display: block; margin: 2px 0; padding-left: 22px; text-indent: -22px; text-align: justify; }
    .formatted-body-content .ww-reference-number { display: inline-block; width: 18px; font-weight: 700; text-indent: 0; }
    .formatted-body-content .ww-reference-text { text-indent: 0; }
    .formatted-page-footer { height: ${BODY_FOOTER_MM}mm; border-top: 1px solid #cbd5e1; color: #64748b; font-family: Arial, sans-serif; font-size: 9px; line-height: ${BODY_FOOTER_MM}mm; text-align: center; }
    @media print { body, .formatted-a4-document { background: #fff; padding: 0; } .formatted-a4-page { margin: 0; box-shadow: none; } }
  </style>`;

const esc = (value = '') =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const norm = (value = '') => value.toLowerCase().replace(/^\s*\d+[.)]?\s*/, '').replace(/[^a-z0-9]/g, '').trim();

function topLevelHtml(root: ParentNode): string[] {
  const nodes = Array.from(root.childNodes).filter((node) => node.nodeType === Node.ELEMENT_NODE || (node.textContent || '').trim());
  return nodes.map((node) => (node as HTMLElement).outerHTML || node.textContent || '');
}

function createBodyPage(content: string, pageNumber: number, totalPlaceholder = '...') {
  return `<section class="formatted-a4-page formatted-body-page" data-formatted-page="body">
    <div class="formatted-running-head">World Wide Journal of Multidisciplinary Research and Development</div>
    <div class="formatted-body-content">${content}</div>
    <div class="formatted-page-footer">~ ${pageNumber} ~</div>
  </section>`;
}

export interface PaginationOptions {
  startPage?: number;            // starting page number (default 1)
  showFirstPageNumber?: boolean; // include footer/page-number on the cover page
}

function cloneContentRoot(source: ParentNode): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = topLevelHtml(source).join('');
  wrapper.querySelectorAll('style, script').forEach((node) => node.remove());
  return wrapper;
}

function removeDuplicateFrontMatter(root: HTMLElement, firstPage: HTMLElement | null) {
  if (!firstPage) return;

  const title = norm(firstPage.querySelector('h1')?.textContent || '');
  const children = Array.from(root.children) as HTMLElement[];

  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const key = norm(text);

    if (title && i < 6 && /^h[1-3]$/.test(tag) && key === title) {
      el.remove();
      continue;
    }

    if (/^(abstract|keywords?|key\s*words?)[:\s-]/i.test(text) || ['abstract', 'keyword', 'keywords'].includes(key)) {
      el.remove();
      let next = children[i + 1];
      while (next && !/^h[1-6]$/i.test(next.tagName)) {
        const after = children[children.indexOf(next) + 1];
        next.remove();
        next = after;
      }
    }
  }
}

function removeDuplicateReferenceSections(root: HTMLElement) {
  const children = Array.from(root.children) as HTMLElement[];
  const referenceStarts = children
    .map((el, index) => ({ el, index, key: norm(el.textContent || '') }))
    .filter(({ el, key }) => /^h[1-6]$/i.test(el.tagName) && ['references', 'bibliography', 'workscited'].includes(key));

  if (referenceStarts.length <= 1) return;

  for (let r = 0; r < referenceStarts.length - 1; r++) {
    const start = referenceStarts[r].index;
    const end = referenceStarts[r + 1].index;
    for (let i = start; i < end; i++) children[i]?.remove();
  }
}

function materializeReferenceNumbers(root: HTMLElement) {
  root.querySelectorAll('ol').forEach((list) => {
    const previousHeading = list.previousElementSibling;
    const isReferenceList =
      list.classList.contains('ww-references') ||
      (!!previousHeading && /^h[1-6]$/i.test(previousHeading.tagName) && ['references', 'bibliography', 'workscited'].includes(norm(previousHeading.textContent || '')));
    if (!isReferenceList) return;

    const replacement = document.createElement('div');
    replacement.className = 'ww-references ww-references-materialized';

    Array.from(list.children).forEach((child, index) => {
      if (child.tagName.toLowerCase() !== 'li') return;
      const item = document.createElement('p');
      item.className = 'ww-reference-item';
      item.innerHTML = `<span class="ww-reference-number">${index + 1}.</span><span class="ww-reference-text">${(child as HTMLElement).innerHTML}</span>`;
      replacement.appendChild(item);
    });

    list.replaceWith(replacement);
  });
}

function getBodyRoot(template: HTMLTemplateElement, firstPage: HTMLElement | null, flowRoot: HTMLElement | null) {
  if (flowRoot) {
    const root = cloneContentRoot(flowRoot);
    removeDuplicateFrontMatter(root, firstPage);
    removeDuplicateReferenceSections(root);
    materializeReferenceNumbers(root);
    return root;
  }

  const sourceRoot = template.content.querySelector('.wwjmrd-article, .formatted-a4-document') || template.content;
  const root = cloneContentRoot(sourceRoot);
  root.querySelectorAll('[data-a4-page="first"], .ww-first-page, [data-formatted-page="first"]').forEach((node) => node.remove());
  removeDuplicateFrontMatter(root, firstPage);
  removeDuplicateReferenceSections(root);
  materializeReferenceNumbers(root);
  return root;
}

/**
 * Split a paragraph/heading into TWO parts: as many words as fit in `firstMaxPx`
 * (current page's remaining height) and the remainder. Never produces single-word
 * fragments unless the element literally has one word.
 */
function splitParagraphFirstFit(
  el: HTMLElement,
  measure: HTMLElement,
  firstMaxPx: number,
): { first: string | null; rest: string | null } {
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(Boolean);
  if (words.length <= 1) return { first: null, rest: el.outerHTML };

  let low = 1;
  let high = words.length;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const clone = el.cloneNode(false) as HTMLElement;
    clone.textContent = words.slice(0, mid).join(' ');
    measure.innerHTML = clone.outerHTML;
    if (measure.scrollHeight <= firstMaxPx) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Avoid orphans: require ~one line of words on the current page, otherwise
  // push the whole paragraph to the next page.
  const MIN_WORDS_ON_PAGE = 6;
  if (best < MIN_WORDS_ON_PAGE) return { first: null, rest: el.outerHTML };
  if (best >= words.length) return { first: el.outerHTML, rest: null };

  const firstEl = el.cloneNode(false) as HTMLElement;
  firstEl.textContent = words.slice(0, best).join(' ');
  const restEl = el.cloneNode(false) as HTMLElement;
  restEl.textContent = words.slice(best).join(' ');
  return { first: firstEl.outerHTML, rest: restEl.outerHTML };
}

// Split a paragraph that is bigger than a full page into N page-sized chunks.
function splitWordsIntoElements(el: HTMLElement, measure: HTMLElement, maxHeightPx: number) {
  const parts: string[] = [];
  let remainder: string | null = el.outerHTML;
  let guard = 0;
  while (remainder && guard++ < 50) {
    const tpl = document.createElement('template');
    tpl.innerHTML = remainder.trim();
    const current = tpl.content.firstElementChild as HTMLElement | null;
    if (!current) break;
    const { first, rest } = splitParagraphFirstFit(current, measure, maxHeightPx);
    if (first) {
      parts.push(first);
      if (!rest) break;
      remainder = rest;
    } else {
      // Even the minimum chunk doesn't fit — emit the whole remainder as one block.
      parts.push(remainder);
      break;
    }
  }
  return parts.length ? parts : [el.outerHTML];
}

function splitListIntoElements(el: HTMLElement, measure: HTMLElement, maxHeightPx: number) {
  const items = Array.from(el.children).filter((child) => child.tagName.toLowerCase() === 'li') as HTMLElement[];
  if (items.length <= 1) return [el.outerHTML];

  const parts: string[] = [];
  let current: string[] = [];

  for (const item of items) {
    const next = [...current, item.outerHTML];
    const clone = el.cloneNode(false) as HTMLElement;
    clone.innerHTML = next.join('');
    measure.innerHTML = clone.outerHTML;

    if (measure.scrollHeight > maxHeightPx && current.length) {
      const pageList = el.cloneNode(false) as HTMLElement;
      pageList.innerHTML = current.join('');
      parts.push(pageList.outerHTML);
      current = [item.outerHTML];
    } else {
      current = next;
    }
  }

  if (current.length) {
    const pageList = el.cloneNode(false) as HTMLElement;
    pageList.innerHTML = current.join('');
    parts.push(pageList.outerHTML);
  }

  return parts;
}

function splitTableIntoElements(el: HTMLElement, measure: HTMLElement, maxHeightPx: number) {
  const rows = Array.from(el.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr')) as HTMLTableRowElement[];
  if (rows.length <= 1) return [el.outerHTML];

  const firstRowIsHeader = Array.from(rows[0].children).some((cell) => cell.tagName.toLowerCase() === 'th');
  const header = firstRowIsHeader ? rows[0].outerHTML : '';
  const bodyRows = firstRowIsHeader ? rows.slice(1) : rows;
  const parts: string[] = [];
  let current: string[] = [];

  const makeTable = (rowHtml: string[]) => {
    const table = el.cloneNode(false) as HTMLElement;
    table.innerHTML = `${header}${rowHtml.join('')}`;
    return table.outerHTML;
  };

  for (const row of bodyRows) {
    const next = [...current, row.outerHTML];
    measure.innerHTML = makeTable(next);

    if (measure.scrollHeight > maxHeightPx && current.length) {
      parts.push(makeTable(current));
      current = [row.outerHTML];
    } else {
      current = next;
    }
  }

  if (current.length) parts.push(makeTable(current));
  return parts.length ? parts : [el.outerHTML];
}

function splitOversizedBlock(block: string, measure: HTMLElement, maxHeightPx: number): string[] {
  const template = document.createElement('template');
  template.innerHTML = block.trim();
  const el = template.content.firstElementChild as HTMLElement | null;
  if (!el) return [block];

  const tag = el.tagName.toLowerCase();
  if (tag === 'table') return splitTableIntoElements(el, measure, maxHeightPx);
  if (tag === 'ul' || tag === 'ol') return splitListIntoElements(el, measure, maxHeightPx);
  if (tag === 'p' || /^h[1-6]$/.test(tag)) return splitWordsIntoElements(el, measure, maxHeightPx);
  if ((tag === 'div' || tag === 'section') && el.children.length > 1) return topLevelHtml(el);
  return [block];
}

export async function buildPagedFormattedArticleHtml(
  html: string,
  options: PaginationOptions = {},
): Promise<string> {
  if (!html.trim()) return html;
  const startPage = Math.max(1, Math.floor(options.startPage ?? 1));
  const showFirstPageNumber = options.showFirstPageNumber ?? true;

  const template = document.createElement('template');
  template.innerHTML = html;
  absolutizeImages(template.content);

  const existingPages = template.content.querySelectorAll('.formatted-a4-page');
  const firstPage = template.content.querySelector('[data-a4-page="first"], .ww-first-page, [data-formatted-page="first"]') as HTMLElement | null;
  const flowRoot = (
    template.content.querySelector('[data-flow-root="true"] .ww-body-flow') ||
    template.content.querySelector('.ww-body-flow') ||
    template.content.querySelector('[data-flow-root="true"]')
  ) as HTMLElement | null;

  if (existingPages.length && !flowRoot) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${pageCss}</head><body>${template.innerHTML}</body></html>`;
  }

  const styleTags = Array.from(template.content.querySelectorAll('style')).map((s) => s.outerHTML).join('');
  const bodyRoot = getBodyRoot(template, firstPage, flowRoot);
  const blocks = topLevelHtml(bodyRoot).filter((block) => block.replace(/<[^>]+>/g, '').trim() || /<(img|table|figure)\b/i.test(block));

  const measureHost = document.createElement('div');
  measureHost.style.cssText = `position:absolute;left:-10000px;top:0;width:${CONTENT_WIDTH_MM}mm;background:#fff;visibility:hidden;pointer-events:none;`;
  const measure = document.createElement('div');
  measure.className = 'formatted-body-content';
  measure.style.cssText = `width:${CONTENT_WIDTH_MM}mm;height:auto;min-height:0;padding-top:4mm;font-size:10.8px;line-height:1.62;font-family:Georgia,'Times New Roman',serif;`;
  measureHost.innerHTML = `${pageCss}${styleTags}`;
  measureHost.appendChild(measure);
  document.body.appendChild(measureHost);
  await waitForImages(template.content);

  const maxHeightPx = BODY_CONTENT_HEIGHT_MM * MM_TO_PX;
  // Leave a tiny safety margin so the last visible line never bleeds past the page footer.
  const fillThresholdPx = maxHeightPx - 6;
  const pages: string[] = [];
  let current = '';

  const measureHeight = (htmlContent: string): number => {
    measure.innerHTML = htmlContent;
    return measure.scrollHeight;
  };

  const getTag = (block: string): string => {
    const tpl = document.createElement('template');
    tpl.innerHTML = block.trim();
    const el = tpl.content.firstElementChild as HTMLElement | null;
    return el?.tagName.toLowerCase() || '';
  };

  const enqueueBlock = (block: string) => {
    const combined = current + block;
    if (measureHeight(combined) <= maxHeightPx) {
      current = combined;
      return;
    }

    const tag = getTag(block);

    // Paragraph that doesn't fit: split first-fit on current page, push remainder.
    if (tag === 'p' && current.trim()) {
      const remainingPx = Math.max(0, fillThresholdPx - measureHeight(current));
      if (remainingPx > 30) {
        const tpl = document.createElement('template');
        tpl.innerHTML = block.trim();
        const el = tpl.content.firstElementChild as HTMLElement | null;
        if (el) {
          const { first, rest } = splitParagraphFirstFit(el, measure, remainingPx);
          if (first) {
            current += first;
            pages.push(current);
            current = '';
            if (rest) enqueueBlock(rest);
            return;
          }
        }
      }
    }

    // Lists: try to fit some items, push rest.
    if ((tag === 'ul' || tag === 'ol') && current.trim()) {
      const remainingPx = Math.max(0, fillThresholdPx - measureHeight(current));
      if (remainingPx > 40) {
        const tpl = document.createElement('template');
        tpl.innerHTML = block.trim();
        const el = tpl.content.firstElementChild as HTMLElement | null;
        if (el) {
          const parts = splitListIntoElements(el, measure, remainingPx);
          if (parts.length > 1) {
            current += parts[0];
            pages.push(current);
            current = '';
            for (let i = 1; i < parts.length; i++) enqueueBlock(parts[i]);
            return;
          }
        }
      }
    }

    // Tables: try to fit some rows, push rest.
    if (tag === 'table' && current.trim()) {
      const remainingPx = Math.max(0, fillThresholdPx - measureHeight(current));
      if (remainingPx > 60) {
        const tpl = document.createElement('template');
        tpl.innerHTML = block.trim();
        const el = tpl.content.firstElementChild as HTMLElement | null;
        if (el) {
          const parts = splitTableIntoElements(el, measure, remainingPx);
          if (parts.length > 1) {
            current += parts[0];
            pages.push(current);
            current = '';
            for (let i = 1; i < parts.length; i++) enqueueBlock(parts[i]);
            return;
          }
        }
      }
    }

    // Couldn't split (figure, image, heading, or no useful split point) —
    // push current page and start a new one with this block.
    if (current.trim()) {
      pages.push(current);
      current = '';
    }

    // If the block alone is bigger than a page, slice it into page-sized chunks.
    if (measureHeight(block) > maxHeightPx) {
      const sub = splitOversizedBlock(block, measure, maxHeightPx);
      for (const piece of sub) {
        if (current && measureHeight(current + piece) > maxHeightPx) {
          pages.push(current);
          current = '';
        }
        current += piece;
      }
    } else {
      current = block;
    }
  };

  for (const originalBlock of blocks) {
    // If a single block is bigger than a full page, slice it first.
    const candidateBlocks = measureHeight(originalBlock) > maxHeightPx
      ? splitOversizedBlock(originalBlock, measure, maxHeightPx)
      : [originalBlock];
    for (const block of candidateBlocks) enqueueBlock(block);
  }

  if (current.trim()) pages.push(current);
  document.body.removeChild(measureHost);

  const totalPages = (firstPage ? 1 : 0) + pages.length;

  const firstPageHtml = firstPage
    ? `<section class="formatted-a4-page formatted-cover-page" data-formatted-page="first">
        <div class="formatted-page-content">${firstPage.innerHTML}</div>
        ${showFirstPageNumber
          ? `<div class="formatted-page-footer">~ ${startPage} ~</div>`
          : ''}
      </section>`
    : '';

  const bodyStart = startPage + (firstPage ? 1 : 0);
  const bodyPagesHtml = pages.map((content, index) => createBodyPage(content, bodyStart + index)).join('');
  const doc = `<div class="formatted-a4-document">${firstPageHtml}${bodyPagesHtml}</div>`.replace(/<span class="formatted-total-pages">\.\.\.<\/span>/g, `<span class="formatted-total-pages">${totalPages}</span>`);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${pageCss}${styleTags}</head><body>${doc}</body></html>`;
}
