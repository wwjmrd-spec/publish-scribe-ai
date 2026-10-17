import { describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { renderAcceptanceLetter } from '../../supabase/functions/_shared/acceptanceLetterPdf';

describe('acceptance PDF generation', () => {
  it('produces a downloadable vector PDF for a manuscript', () => {
    const pdf = renderAcceptanceLetter(new jsPDF(), { letterNumber: 'WWJMRD/ART-2026-0426/2026', acceptanceDate: '12 October 2026', authorName: 'Shubham Meena', affiliation: 'University', country: 'India', reference: 'ART-2026-0426', title: 'Research manuscript', authors: ['Shubham Meena'] });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
  it('wraps long titles and author lists without overflowing page boundaries', () => {
    const doc = new jsPDF();
    const text = vi.spyOn(doc, 'text');
    renderAcceptanceLetter(doc, { letterNumber: 'WWJMRD/ART-2026-0426/2026', acceptanceDate: '12 October 2026', authorName: 'Corresponding author', affiliation: '', country: 'India', reference: 'ART-2026-0426', title: 'Research title '.repeat(100), authors: Array.from({ length: 100 }, (_, i) => `Co-author ${i}`) });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(text.mock.calls.every(call => Number(call[2]) <= 273)).toBe(true);
  });
});