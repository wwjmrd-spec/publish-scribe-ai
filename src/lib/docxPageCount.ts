import JSZip from 'jszip';

const DOCX_APP_PROPERTIES_PATH = 'docProps/app.xml';
const DOCX_DOCUMENT_PATH = 'word/document.xml';
const MAX_REASONABLE_PAGE_COUNT = 500;

function normalizePageCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value);
    return rounded >= 1 && rounded <= MAX_REASONABLE_PAGE_COUNT ? rounded : null;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_REASONABLE_PAGE_COUNT ? parsed : null;
  }

  return null;
}

export function parseDocxMetadataPageCount(xml: string | null | undefined): number | null {
  if (!xml) return null;
  const match = xml.match(/<Pages>(\d+)<\/Pages>/i);
  return normalizePageCount(match?.[1] ?? null);
}

export function countRenderedDocxPages(xml: string | null | undefined): number | null {
  if (!xml) return null;
  const renderedBreaks = (xml.match(/<w:lastRenderedPageBreak\b/g) || []).length;
  if (renderedBreaks > 0) return renderedBreaks + 1;
  return null;
}

export async function extractDocxPageCountFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<number | null> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);

    const appXml = await zip.file(DOCX_APP_PROPERTIES_PATH)?.async('string');
    const metadataPageCount = parseDocxMetadataPageCount(appXml);
    if (metadataPageCount) return metadataPageCount;

    const documentXml = await zip.file(DOCX_DOCUMENT_PATH)?.async('string');
    return countRenderedDocxPages(documentXml);
  } catch (error) {
    console.warn('Unable to read DOCX page count metadata:', error);
    return null;
  }
}

export async function extractDocxPageCount(file: File): Promise<number | null> {
  return extractDocxPageCountFromArrayBuffer(await file.arrayBuffer());
}