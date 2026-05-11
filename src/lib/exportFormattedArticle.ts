import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Render formatted-article HTML into an offscreen container that mirrors
 * the website preview, then capture it as a multi-page PDF.
 */
export async function downloadFormattedAsPdf(html: string, fileName: string) {
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;left:0;top:0;width:820px;background:#ffffff;z-index:-9999;opacity:0;pointer-events:none;';
  container.innerHTML = html;
  document.body.appendChild(container);

  // Force absolute URLs for relative image src so html2canvas + cors works
  const origin = window.location.origin;
  container.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('/')) img.setAttribute('src', origin + src);
    img.crossOrigin = 'anonymous';
  });

  // Wait for images
  const imgs = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          const el = img as HTMLImageElement;
          if (el.complete && el.naturalWidth > 0) return resolve();
          el.addEventListener('load', () => resolve(), { once: true });
          el.addEventListener('error', () => resolve(), { once: true });
        }),
    ),
  );

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 820,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let heightLeft = imgH;
    let position = 0;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    pdf.addImage(dataUrl, 'JPEG', 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position = heightLeft - imgH;
      pdf.addPage();
      pdf.addImage(dataUrl, 'JPEG', 0, position, imgW, imgH);
      heightLeft -= pageH;
    }

    pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Convert formatted-article HTML to a Word (.docx) blob via dynamic import,
 * so a missing optional dep won't break the bundle. Word has limited CSS
 * support, but the table-based layout in `format-article` carries over well.
 */
export async function downloadFormattedAsDocx(html: string, fileName: string) {
  const origin = window.location.origin;
  // Make image URLs absolute so Word can resolve them
  const absHtml = html.replace(/src="\/(?!\/)/g, `src="${origin}/`);

  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Article</title></head><body>${absHtml}</body></html>`;

  const mod: any = await import('html-docx-js-typescript');
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
