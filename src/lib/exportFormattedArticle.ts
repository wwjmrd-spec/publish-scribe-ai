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

async function waitForFonts() {
  if ('fonts' in document) {
    await document.fonts.ready;
  }
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
 * Build a print-quality PDF that matches the editor's A4 pages exactly:
 * the browser renders the pages (fonts, colours, bullets, backgrounds, spacing)
 * and each page is captured at ~380 DPI, so nothing is re-interpreted.
 */

export async function buildFormattedPdfBlob(html: string, options: PaginationOptions = {}): Promise<Blob> {
  const container = document.createElement('div');
  container.style.cssText =
    'position:absolute;left:-10000px;top:0;width:210mm;background:#ffffff;z-index:-9999;pointer-events:none;';
  container.innerHTML = await buildPagedFormattedArticleHtml(html, options);

  // The preview stylesheet intentionally scales A4 pages below 900px. Passing
  // the page width to html2canvas as its virtual viewport used to activate that
  // mobile rule, capturing a 46%-sized page and stretching it back to A4. That
  // caused both blur and displaced text/boxes. Export pages must always retain
  // their physical A4 geometry, regardless of the user's screen size.
  const exportOverrides = document.createElement('style');
  exportOverrides.textContent = `
    .formatted-a4-document { width: 210mm !important; padding: 0 !important; }
    .formatted-a4-page {
      width: 210mm !important;
      min-width: 210mm !important;
      max-width: 210mm !important;
      height: 297mm !important;
      min-height: 297mm !important;
      max-height: 297mm !important;
      margin: 0 !important;
      transform: none !important;
      transform-origin: top left !important;
      box-shadow: none !important;
    }
  `;
  container.appendChild(exportOverrides);
  document.body.appendChild(container);

  makeImagesExportSafe(container);
  await Promise.all([waitForImages(container), waitForFonts()]);

  try {
    const pages = Array.from(container.querySelectorAll('.formatted-a4-page')) as HTMLElement[];
    if (!pages.length) throw new Error('No A4 pages were generated');

    // Pixel-exact capture of the editor's own rendering (fonts, colours, bullets,
    // backgrounds and spacing all identical), at ~380 DPI so print stays crisp.
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];
      if (index > 0) pdf.addPage();

      const captureWidth = page.offsetWidth;
      const captureHeight = page.offsetHeight;

      const canvas = await html2canvas(page, {
        scale: 4,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 0,
        letterRendering: true,
        width: captureWidth,
        height: captureHeight,
        // Keep the cloned document above the responsive-preview breakpoint.
        // The explicit dimensions above still capture only the A4 page.
        windowWidth: 1400,
        windowHeight: 1600,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDocument: Document) => {
          const style = clonedDocument.createElement('style');
          style.textContent = `
            *, *::before, *::after {
              animation: none !important;
              transition: none !important;
              caret-color: transparent !important;
            }
            .formatted-a4-page {
              width: 210mm !important;
              min-width: 210mm !important;
              max-width: 210mm !important;
              height: 297mm !important;
              min-height: 297mm !important;
              max-height: 297mm !important;
              margin: 0 !important;
              transform: none !important;
              box-shadow: none !important;
            }
          `;
          clonedDocument.head.appendChild(style);
        },
      } as any);

      const dataUrl = canvas.toDataURL('image/png');
      // Lossless PNG with maximum deflate compression: keeps fine text and thin
      // borders sharp without producing an impractically large upload.
      pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'SLOW');
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
