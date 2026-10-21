import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn(), pdf: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, functions: { invoke: mocks.invoke } } }));
vi.mock('./exportFormattedArticle', () => ({ buildFormattedPdfBlob: mocks.pdf }));
import { uploadFormattedPdfToWwjmrd, startPageFromRange } from './uploadFormattedPdf';
describe('journal PDF uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { formatted_content: '<p>Manuscript</p>' }, error: null }) });
    mocks.pdf.mockResolvedValue({ arrayBuffer: async () => new TextEncoder().encode('%PDF-1.7').buffer });
  });
  it('rejects failed FTP uploads with the actual server error rather than reporting success', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'WWJMRD PDF upload failed during connection' }), { status: 502 }) } });
    await expect(uploadFormattedPdfToWwjmrd('article')).rejects.toThrow('WWJMRD PDF upload failed during connection');
  });
  it('returns the journal file only after a confirmed successful upload', async () => {
    mocks.invoke.mockResolvedValue({ error: null, data: { success: true, url: 'https://wwjmrd.com/upload2/article_0426.pdf', fileName: 'article_0426.pdf' } });
    await expect(uploadFormattedPdfToWwjmrd('article')).resolves.toEqual({ url: 'https://wwjmrd.com/upload2/article_0426.pdf', fileName: 'article_0426.pdf' });
  });
  it('numbers the journal PDF from the approved page range', async () => {
    mocks.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { formatted_content: '<p>Manuscript</p>', page_number: '216-226' }, error: null }) });
    mocks.invoke.mockResolvedValue({ error: null, data: { success: true, url: 'https://wwjmrd.com/pdf/a_0482.pdf', fileName: 'a_0482.pdf' } });
    await uploadFormattedPdfToWwjmrd('article');
    expect(mocks.pdf).toHaveBeenCalledWith('<p>Manuscript</p>', expect.objectContaining({ startPage: 216, showFirstPageNumber: true }));
  });
  it('reads the first page from saved ranges', () => {
    expect(startPageFromRange('216-226')).toBe(216);
    expect(startPageFromRange('12')).toBe(12);
    expect(startPageFromRange(null)).toBe(1);
  });
});
