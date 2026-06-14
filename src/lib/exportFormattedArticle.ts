import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { buildPagedFormattedArticleHtml, type PaginationOptions } from './formattedArticlePagination';

async function waitForImages(root: ParentNode, timeoutMs = 4000) {
  const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve();
          const done = () => resolve();
          const t = window.setTimeout(done, timeoutMs);
          const finish = () => { window.clearTimeout(t); done(); };
          img.addEventListener('load', finish, { once: true });
          img.addEventListener('error', finish, { once: true });
        }),
    ),
  );
}

function makeImagesExportSafe(root: ParentNode) {
  const origin = window.location.origin;
  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('/')) img.setAttribute('src', origin + src);
    if (!src.startsWith('data:')) (img as HTMLImageElement).crossOrigin = 'anonymous';
  });
}

/**
 * Render each A4 page separately. Capturing one very tall canvas can hit
 * browser canvas limits and silently export only the first pages.
 */
export async function buildFormattedPdfBlob(html: string, options: PaginationOptions = {}): Promise<Blob> {
  const container = document.createElement('div');
  container.style.cssText =
    'position:absolute;left:-10000px;top:0;width:210mm;background:#ffffff;z-index:-9999;pointer-events:none;';
  container.innerHTML = await buildPagedFormattedArticleHtml(html, options);
  document.body.appendChild(container);

  makeImagesExportSafe(container);
  await waitForImages(container);

  try {
    const pages = Array.from(container.querySelectorAll('.formatted-a4-page')) as HTMLElement[];
    if (!pages.length) throw new Error('No A4 pages were generated');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];
      if (index > 0) pdf.addPage();

      const canvas = await html2canvas(page, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 0,
        letterRendering: true,
        windowWidth: page.scrollWidth,
        windowHeight: page.scrollHeight,
      } as any);

      // PNG for lossless, HD-clear text rendering.
      const dataUrl = canvas.toDataURL('image/png');
      pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
    }

    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
}

export async function downloadFormattedAsPdf(html: string, fileName: string, options: PaginationOptions = {}) {
  const blob = await buildFormattedPdfBlob(html, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Convert formatted-article HTML to a Word (.docx) blob via dynamic import,
 * so a missing optional dep won't break the bundle.
 */
export async function downloadFormattedAsDocx(html: string, fileName: string, options: PaginationOptions = {}) {
  const origin = window.location.origin;
  const pagedHtml = await buildPagedFormattedArticleHtml(html, options);
  const absHtml = pagedHtml.replace(/src="\/(?!\/)/g, `src="${origin}/`);

  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Article</title></head><body>${absHtml}</body></html>`;

  const mod = await import('html-docx-js-typescript') as {
    asBlob?: (html: string, options: unknown) => Promise<Blob>;
    default?: { asBlob?: (html: string, options: unknown) => Promise<Blob> };
  };
  const asBlob = mod.asBlob || mod.default?.asBlob;
  if (!asBlob) throw new Error('Word export library failed to load');

  const blob = (await asBlob(fullHtml, {
    orientation: 'portrait',
    margins: { top: 720, right: 720, bottom: 720, left: 720 },
  })) as Blob;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.docx') ? fileName : `${fileName}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
