import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  countRenderedDocxPages,
  extractDocxPageCountFromArrayBuffer,
  parseDocxMetadataPageCount,
  qualifiesForTwoPageFree,
  resolveDocxPageCount,
  resolveSubmissionPageCount,
} from './docxPageCount';

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function buildDocxFixture({
  metadataPages,
  renderedBreaks,
}: {
  metadataPages?: number;
  renderedBreaks?: number;
}) {
  const zip = new JSZip();

  if (metadataPages) {
    zip.file(
      'docProps/app.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Pages>${metadataPages}</Pages></Properties>`
    );
  }

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${WORD_NAMESPACE}"><w:body>${'<w:lastRenderedPageBreak/>'.repeat(renderedBreaks ?? 0)}</w:body></w:document>`
  );

  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('docxPageCount', () => {
  it('reads the exact page count from DOCX app metadata', async () => {
    const buffer = await buildDocxFixture({ metadataPages: 8, renderedBreaks: 11 });
    await expect(extractDocxPageCountFromArrayBuffer(buffer)).resolves.toBe(8);
  });

  it('falls back to rendered page breaks when app metadata is missing', async () => {
    const buffer = await buildDocxFixture({ renderedBreaks: 7 });
    await expect(extractDocxPageCountFromArrayBuffer(buffer)).resolves.toBe(8);
  });

  it('parses helper values deterministically', () => {
    expect(parseDocxMetadataPageCount('<Pages>8</Pages>')).toBe(8);
    expect(countRenderedDocxPages('<w:lastRenderedPageBreak/><w:lastRenderedPageBreak/>')).toBe(3);
  });
});
describe('page count rules', () => {
  const wordsXml = (n: number) =>
    `<w:document><w:body><w:p><w:r><w:t>${Array.from({ length: n }, () => 'word').join(' ')}</w:t></w:r></w:p></w:body></w:document>`;

  it('does not trust a stale 1-page metadata value for a 3000-word manuscript', () => {
    const result = resolveDocxPageCount('<Pages>1</Pages>', wordsXml(3000));
    expect(result.pageCount).toBe(6);
  });

  it('replaces a stale saved count of 1 with the text estimate for ~1250 words', () => {
    expect(resolveDocxPageCount('<Pages>1</Pages>', wordsXml(1250)).pageCount).toBe(3);
  });

  it('keeps an accurate saved count from Word', () => {
    expect(resolveDocxPageCount('<Pages>2</Pages>', wordsXml(900)).pageCount).toBe(2);
  });

  it('estimates from text when the file has no saved page count', () => {
    expect(resolveDocxPageCount(null, wordsXml(900)).pageCount).toBe(2);
    expect(resolveDocxPageCount(null, wordsXml(1100)).pageCount).toBe(3);
  });

  it('counts a table row crossing a page only once', () => {
    const table = '<w:tbl><w:tr><w:tc><w:p><w:lastRenderedPageBreak/></w:p></w:tc><w:tc><w:p><w:lastRenderedPageBreak/></w:p></w:tc></w:tr></w:tbl>';
    expect(countRenderedDocxPages(`<w:body>${table}</w:body>`)).toBe(2);
  });

  it('uses the larger of the author-stated and detected page counts', () => {
    expect(resolveSubmissionPageCount(2, 4)).toBe(4);
    expect(resolveSubmissionPageCount(5, 2)).toBe(5);
    expect(resolveSubmissionPageCount(2, null)).toBe(2);
  });

  it('never makes an article free when 2-page free publication is disabled', () => {
    expect(qualifiesForTwoPageFree(1, false)).toBe(false);
    expect(qualifiesForTwoPageFree(2, false)).toBe(false);
  });

  it('makes only 1–2 page articles free when enabled', () => {
    expect(qualifiesForTwoPageFree(1, true)).toBe(true);
    expect(qualifiesForTwoPageFree(2, true)).toBe(true);
    expect(qualifiesForTwoPageFree(3, true)).toBe(false);
    expect(qualifiesForTwoPageFree(null, true)).toBe(false);
  });
});
