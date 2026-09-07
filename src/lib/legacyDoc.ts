/**
 * Best-effort text extraction for legacy Microsoft Word (.doc, Word 97-2003)
 * files in the browser. mammoth.js only understands the newer .docx (OOXML)
 * format, so for .doc we read the binary and pull out the readable text runs
 * that Word stores in the WordDocument stream. This is good enough for the AI
 * scan (title, abstract, keywords, authors) even though formatting is lost.
 */

function isPrintable(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255);
}

function cleanup(raw: string): string {
  return raw
    // Word field codes / control artifacts
    .replace(/HYPERLINK\s+"[^"]*"/gi, ' ')
    .replace(/\b(PAGE|NUMPAGES|TOC|HYPERLINK|MERGEFORMAT|EMBED|Equation|MacroButton)\b/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Extracts readable text from a legacy .doc ArrayBuffer. */
export function extractTextFromLegacyDoc(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  // Word 97 files often store text as UTF-16LE runs; also collect 8-bit runs.
  const utf16Chunks: string[] = [];
  const asciiChunks: string[] = [];

  let run: number[] = [];
  const flushAscii = () => {
    if (run.length >= 12) asciiChunks.push(String.fromCharCode(...run));
    run = [];
  };

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (isPrintable(b)) run.push(b);
    else flushAscii();
    if (run.length > 4096) flushAscii();
  }
  flushAscii();

  let run16: number[] = [];
  const flush16 = () => {
    if (run16.length >= 12) utf16Chunks.push(String.fromCharCode(...run16));
    run16 = [];
  };
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (bytes[i + 1] === 0 && isPrintable(bytes[i])) run16.push(code);
    else flush16();
    if (run16.length > 4096) flush16();
  }
  flush16();

  const utf16Text = cleanup(utf16Chunks.join('\n'));
  const asciiText = cleanup(asciiChunks.join('\n'));

  // Pick whichever variant yielded more real words.
  const wordCount = (s: string) => (s.match(/\b[A-Za-z]{3,}\b/g) || []).length;
  const best = wordCount(utf16Text) >= wordCount(asciiText) ? utf16Text : asciiText;

  // Drop lines that are mostly binary noise (few letters, lots of symbols).
  return best
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (t.length < 3) return false;
      const letters = (t.match(/[A-Za-z0-9.,;:()'"\-\s]/g) || []).length;
      return letters / t.length > 0.75;
    })
    .join('\n')
    .trim();
}

/** True when the file is a legacy .doc (not .docx). */
export function isLegacyDocFile(file: File): boolean {
  return /\.doc$/i.test(file.name);
}
