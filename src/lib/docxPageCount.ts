import JSZip from 'jszip';
import {
  countRenderedDocxPages,
  parseDocxMetadataPageCount,
  qualifiesForTwoPageFree,
  resolveDocxPageCount,
  resolveSubmissionPageCount,
} from '../../supabase/functions/_shared/docxPageCount';

export {
  countRenderedDocxPages,
  parseDocxMetadataPageCount,
  qualifiesForTwoPageFree,
  resolveDocxPageCount,
  resolveSubmissionPageCount,
};

export async function extractDocxPageCountFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<number | null> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const appXml = await zip.file('docProps/app.xml')?.async('string');
    const documentXml = await zip.file('word/document.xml')?.async('string');
    return resolveDocxPageCount(appXml, documentXml).pageCount;
  } catch (error) {
    console.warn('Unable to read DOCX page count:', error);
    return null;
  }
}

export async function extractDocxPageCount(file: File): Promise<number | null> {
  return extractDocxPageCountFromArrayBuffer(await file.arrayBuffer());
}
