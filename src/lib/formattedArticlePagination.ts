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
    .formatted-a4-page { width: ${A4_WIDTH_MM}mm; min-height: ${A4_HEIGHT_MM}mm; height: ${A4_HEIGHT_MM}mm; margin: 0 auto 18px; padding: ${PAGE_PADDING_MM}mm; background: #fff; color: #0f172a; box-shadow: 0 5px 18px rgba(0,0,0,.32); overflow: hidden; page-break-after: always; break-after: page; }
    .formatted-a4-page:last-child { page-break-after: auto; break-after: auto; }
    .formatted-page-content { width: ${CONTENT_WIDTH_MM}mm; min-height: ${CONTENT_HEIGHT_MM}mm; }
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
    <div class="formatted-page-footer">~ ${pageNumber} / <span class="formatted-total-pages">${totalPlaceholder}</span> ~</div>
  </section>`;
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

function getBodyRoot(template: HTMLTemplateElement, firstPage: HTMLElement | null, flowRoot: HTMLElement | null) {
  if (flowRoot) {
    const root = cloneContentRoot(flowRoot);
    removeDuplicateFrontMatter(root, firstPage);
    removeDuplicateReferenceSections(root);
    return root;
  }

  const sourceRoot = template.content.querySelector('.wwjmrd-article, .formatted-a4-document') || template.content;
  const root = cloneContentRoot(sourceRoot);
  root.querySelectorAll('[data-a4-page="first"], .ww-first-page, [data-formatted-page="first"]').forEach((node) => node.remove());
  removeDuplicateFrontMatter(root, firstPage);
  removeDuplicateReferenceSections(root);
  return root;
}

function splitWordsIntoElements(el: HTMLElement, measure: HTMLElement, maxHeightPx: number) {
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(Boolean);
  if (words.length <= 1) return [el.outerHTML];

  const parts: string[] = [];
  let start = 0;
  while (start < words.length) {
    let low = start + 1;
    let high = words.length;
    let best = low;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const clone = el.cloneNode(false) as HTMLElement;
      clone.textContent = words.slice(start, mid).join(' ');
      measure.innerHTML = clone.outerHTML;
      if (measure.scrollHeight <= maxHeightPx || mid === start + 1) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const clone = el.cloneNode(false) as HTMLElement;
    clone.textContent = words.slice(start, best).join(' ');
    parts.push(clone.outerHTML);
    start = best;
  }

  return parts;
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

export async function buildPagedFormattedArticleHtml(html: string): Promise<string> {
  if (!html.trim()) return html;

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
  const pages: string[] = [];
  let current = '';

  for (const originalBlock of blocks) {
    measure.innerHTML = originalBlock;
    const candidateBlocks = measure.scrollHeight > maxHeightPx
      ? splitOversizedBlock(originalBlock, measure, maxHeightPx)
      : [originalBlock];

    for (const block of candidateBlocks) {
      measure.innerHTML = current + block;
      if (measure.scrollHeight > maxHeightPx && current.trim()) {
        pages.push(current);
        current = block;
        measure.innerHTML = current;
      } else {
        current += block;
      }
    }
  }

  if (current.trim()) pages.push(current);
  document.body.removeChild(measureHost);

  const firstPageHtml = firstPage
    ? `<section class="formatted-a4-page" data-formatted-page="first"><div class="formatted-page-content">${firstPage.innerHTML}</div></section>`
    : '';

  const bodyStart = firstPageHtml ? 2 : 1;
  const bodyPagesHtml = pages.map((content, index) => createBodyPage(content, bodyStart + index)).join('');
  const totalPages = (firstPageHtml ? 1 : 0) + pages.length;
  const doc = `<div class="formatted-a4-document">${firstPageHtml}${bodyPagesHtml}</div>`.replace(/<span class="formatted-total-pages">\.\.\.<\/span>/g, `<span class="formatted-total-pages">${totalPages}</span>`);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">${pageCss}${styleTags}</head><body>${doc}</body></html>`;
}
