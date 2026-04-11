import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  countRenderedDocxPages,
  extractDocxPageCountFromArrayBuffer,
  parseDocxMetadataPageCount,
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