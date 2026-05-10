import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { asBlob } from 'html-docx-js-typescript';

/**
 * Render the given formatted-article HTML (the same markup shown on the
 * website preview) into an offscreen container and capture it as a multi-page
 * PDF that visually matches the preview.
 */
export async function downloadFormattedAsPdf(html: string, fileName: string) {
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;left:-10000px;top:0;width:820px;background:#fff;z-index:-1;';
  container.innerHTML = html;
  document.body.appendChild(container);

  // Wait for images to load so html2canvas captures them
  const imgs = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if ((img as HTMLImageElement).complete) return resolve();
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        }),
    ),
  );

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: container.scrollWidth,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let heightLeft = imgH;
    let position = 0;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

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
 * Convert the formatted-article HTML to a Word (.docx) blob and download it.
 * Word has limited CSS support so the result is a best-effort visual match,
 * but uses the SAME source HTML as the preview.
 */
export async function downloadFormattedAsDocx(html: string, fileName: string) {
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
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
  URL.revokeObjectURL(url);
}
