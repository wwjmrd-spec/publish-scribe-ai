import jsPDF from 'jspdf';

/**
 * Renders laid-out A4 DOM pages into a jsPDF document using REAL vector text
 * (no screenshots), so the resulting PDF is crisp at any zoom / print size —
 * the same quality you get from "Save as PDF" in Microsoft Word.
 *
 * Strategy: the browser does the layout (exactly what the A4 preview shows),
 * then we walk the DOM and paint each box / line of text into the PDF with
 * measured coordinates.
 */

type Px2Mm = (px: number) => number;

const A4_W = 210;
const A4_H = 297;

function parseColor(value: string): { r: number; g: number; b: number; a: number } | null {
  if (!value) return null;
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((v) => parseFloat(v.trim()));
  const [r, g, b] = parts;
  const a = parts.length > 3 ? parts[3] : 1;
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b, a };
}

function pickFont(family: string): 'times' | 'helvetica' | 'courier' {
  const f = (family || '').toLowerCase();
  if (f.includes('courier') || f.includes('mono')) return 'courier';
  if (
    f.includes('georgia') ||
    f.includes('times') ||
    f.includes('serif') && !f.includes('sans-serif') ||
    f.includes('cambria') ||
    f.includes('garamond')
  ) {
    return 'times';
  }
  return 'helvetica';
}

function fontStyle(weight: string, style: string): 'normal' | 'bold' | 'italic' | 'bolditalic' {
  const numeric = parseInt(weight, 10);
  const bold = weight === 'bold' || weight === 'bolder' || (!Number.isNaN(numeric) && numeric >= 600);
  const italic = style === 'italic' || style === 'oblique';
  if (bold && italic) return 'bolditalic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'normal';
}

function imageToDataUrl(img: HTMLImageElement): string | null {
  const src = img.currentSrc || img.src;
  if (src.startsWith('data:')) return src;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.clientWidth;
    canvas.height = img.naturalHeight || img.clientHeight;
    if (!canvas.width || !canvas.height) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function drawBoxDecorations(pdf: jsPDF, el: HTMLElement, pageRect: DOMRect, toMm: Px2Mm) {
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity || '1') === 0) return;
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const x = toMm(rect.left - pageRect.left);
  const y = toMm(rect.top - pageRect.top);
  const w = toMm(rect.width);
  const h = toMm(rect.height);

  const bg = parseColor(cs.backgroundColor);
  if (bg && bg.a > 0.02 && !(bg.r === 255 && bg.g === 255 && bg.b === 255)) {
    pdf.setFillColor(bg.r, bg.g, bg.b);
    pdf.rect(x, y, w, h, 'F');
  }

  const sides: Array<['Top' | 'Right' | 'Bottom' | 'Left', number, number, number, number]> = [
    ['Top', x, y, x + w, y],
    ['Right', x + w, y, x + w, y + h],
    ['Bottom', x, y + h, x + w, y + h],
    ['Left', x, y, x, y + h],
  ];

  sides.forEach(([side, x1, y1, x2, y2]) => {
    const width = parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0;
    const style = cs.getPropertyValue(`border-${side.toLowerCase()}-style`);
    if (width <= 0 || style === 'none' || style === 'hidden') return;
    const color = parseColor(cs.getPropertyValue(`border-${side.toLowerCase()}-color`));
    if (!color || color.a < 0.05) return;
    pdf.setDrawColor(color.r, color.g, color.b);
    pdf.setLineWidth(Math.max(toMm(width), 0.1));
    pdf.line(x1, y1, x2, y2);
  });
}

function drawTextNode(pdf: jsPDF, node: Text, pageRect: DOMRect, toMm: Px2Mm) {
  const raw = node.nodeValue || '';
  if (!raw.trim()) return;
  const parent = node.parentElement;
  if (!parent) return;
  const cs = getComputedStyle(parent);
  if (cs.visibility === 'hidden' || cs.display === 'none') return;

  const color = parseColor(cs.color) || { r: 0, g: 0, b: 0, a: 1 };
  const fontSizePx = parseFloat(cs.fontSize) || 12;
  const fontSizePt = fontSizePx * 0.75; // css px -> pt
  const family = pickFont(cs.fontFamily);
  const style = fontStyle(cs.fontWeight, cs.fontStyle);
  const transform = cs.textTransform;
  const underline = (cs.textDecorationLine || '').includes('underline');
  const lineThrough = (cs.textDecorationLine || '').includes('line-through');
  const justified = cs.textAlign === 'justify';
  const centered = cs.textAlign === 'center';
  const rightAligned = cs.textAlign === 'right' || cs.textAlign === 'end';

  pdf.setFont(family, style);
  pdf.setFontSize(fontSizePt);
  pdf.setTextColor(color.r, color.g, color.b);

  // Walk the text node character-by-character to map each visual line back to
  // its exact rectangle, so line breaks match the on-screen layout precisely.
  const range = document.createRange();
  const len = raw.length;
  const rects: Array<{ text: string; rect: DOMRect }> = [];

  let lineStart = 0;
  let currentRect: DOMRect | null = null;

  const rectOf = (start: number, end: number): DOMRect | null => {
    range.setStart(node, start);
    range.setEnd(node, end);
    const list = range.getClientRects();
    if (!list.length) return null;
    return list[0];
  };

  for (let i = 0; i < len; i++) {
    const charRect = rectOf(i, i + 1);
    if (!charRect || (!charRect.width && !charRect.height)) continue;
    if (!currentRect) {
      currentRect = charRect;
      lineStart = i;
      continue;
    }
    const sameLine = Math.abs(charRect.top - currentRect.top) < 1.2;
    if (!sameLine) {
      const r = rectOf(lineStart, i);
      if (r) rects.push({ text: raw.slice(lineStart, i), rect: r });
      currentRect = charRect;
      lineStart = i;
    }
  }
  if (currentRect) {
    const r = rectOf(lineStart, len);
    if (r) rects.push({ text: raw.slice(lineStart, len), rect: r });
  }
  range.detach?.();

  rects.forEach(({ text, rect }) => {
    let content = text.replace(/\s+/g, ' ');
    if (transform === 'uppercase') content = content.toUpperCase();
    else if (transform === 'lowercase') content = content.toLowerCase();
    const trimmed = content.trim();
    if (!trimmed) return;

    const leftPad = content.length - content.replace(/^\s+/, '').length ? 0 : 0;
    void leftPad;

    const boxX = toMm(rect.left - pageRect.left);
    const boxW = toMm(rect.width);
    // Baseline: line box may be taller than the glyphs (line-height).
    const glyphTop = rect.top + (rect.height - fontSizePx) / 2;
    const baselinePx = glyphTop + fontSizePx * 0.8;
    const baseline = toMm(baselinePx - pageRect.top);

    const naturalW = pdf.getTextWidth(trimmed);
    let x = boxX;
    let charSpace = 0;

    if (justified && trimmed.length > 1 && boxW > naturalW && boxW - naturalW < boxW * 0.35) {
      charSpace = (boxW - naturalW) / (trimmed.length - 1);
    } else if (centered) {
      x = boxX + Math.max(0, (boxW - naturalW) / 2);
    } else if (rightAligned) {
      x = boxX + Math.max(0, boxW - naturalW);
    } else if (naturalW > boxW && boxW > 0) {
      // Squeeze slightly so substituted metrics never overflow the column.
      charSpace = (boxW - naturalW) / Math.max(1, trimmed.length - 1);
    }

    pdf.text(trimmed, x, baseline, charSpace ? ({ charSpace } as any) : undefined);

    const drawnW = naturalW + charSpace * Math.max(0, trimmed.length - 1);
    if (underline || lineThrough) {
      pdf.setDrawColor(color.r, color.g, color.b);
      pdf.setLineWidth(Math.max(toMm(fontSizePx * 0.06), 0.08));
      const yLine = underline ? baseline + toMm(fontSizePx * 0.14) : baseline - toMm(fontSizePx * 0.28);
      pdf.line(x, yLine, x + drawnW, yLine);
    }
  });
}

function drawImage(pdf: jsPDF, img: HTMLImageElement, pageRect: DOMRect, toMm: Px2Mm) {
  const rect = img.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const dataUrl = imageToDataUrl(img);
  if (!dataUrl) return;
  try {
    pdf.addImage(
      dataUrl,
      'PNG',
      toMm(rect.left - pageRect.left),
      toMm(rect.top - pageRect.top),
      toMm(rect.width),
      toMm(rect.height),
      undefined,
      'SLOW',
    );
  } catch {
    /* ignore un-encodable image */
  }
}

function renderPage(pdf: jsPDF, page: HTMLElement) {
  const pageRect = page.getBoundingClientRect();
  const scale = A4_W / pageRect.width; // px -> mm, honours any CSS zoom
  const toMm: Px2Mm = (px) => px * scale;

  // Pass 1: boxes (backgrounds, borders) in document order.
  const elements = [page, ...Array.from(page.querySelectorAll<HTMLElement>('*'))];
  elements.forEach((el) => {
    if (el.tagName === 'IMG' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
    drawBoxDecorations(pdf, el, pageRect, toMm);
  });

  // Pass 2: images.
  Array.from(page.querySelectorAll<HTMLImageElement>('img')).forEach((img) => drawImage(pdf, img, pageRect, toMm));

  // Pass 3: text.
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }
  textNodes.forEach((textNode) => drawTextNode(pdf, textNode, pageRect, toMm));
}

/** Render already-laid-out `.formatted-a4-page` elements into a vector PDF. */
export function renderA4PagesToPdf(pages: HTMLElement[]): jsPDF {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pages.forEach((page, index) => {
    if (index > 0) pdf.addPage([A4_W, A4_H], 'portrait');
    renderPage(pdf, page);
  });
  return pdf;
}
