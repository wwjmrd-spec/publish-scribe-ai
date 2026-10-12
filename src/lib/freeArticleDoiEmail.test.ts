import { describe, expect, it, vi } from 'vitest';
import { sendNextFreeArticleDoiEmail } from '../../supabase/functions/_shared/freeArticleDoiEmail';
const preferences = {
  enabled: async () => true,
  unsubscribeUrl: async () => 'https://wwjmrdai.online/unsubscribe?token=test',
};

function fixture(country = 'India', paid = false) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const db = {
    rpc: vi.fn().mockResolvedValue({ data: [{ article_id: 'article-1' }], error: null }),
    from: vi.fn((table: string) => table === 'articles' ? {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
        id: 'article-1', title: 'Scientific Research', reference_number: 'ART-2026-0001', author_id: 'author-1', doi_paid: paid, status: 'free',
        profiles: { full_name: 'Test Author', email: 'author@example.com', country, is_indian: country === 'India' },
      }, error: null }) }) }),
    } : { update }),
  };
  return { db, update, send: vi.fn().mockResolvedValue(undefined) };
}

describe('free article DOI acceptance emails', () => {
  it.each([['India', 'Rs 500 (INR)'], ['France', '$10 (USD)']])('personalizes fees for %s', async (country, fee) => {
    const { db, send, update } = fixture(country);
    await sendNextFreeArticleDoiEmail(db, send, preferences);
    expect(send).toHaveBeenCalledWith('author@example.com', 'free-article-doi-fee', expect.objectContaining({
      authorName: 'Test Author', articleTitle: 'Scientific Research', referenceNumber: 'ART-2026-0001', doiFeeLabel: fee,
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
  });
  it('does not request fees already paid', async () => {
    const { db, send, update } = fixture('India', true);
    await sendNextFreeArticleDoiEmail(db, send, preferences);
    expect(send).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'skipped' }));
  });
  it('retries failed delivery without marking the event sent', async () => {
    const { db, send, update } = fixture();
    send.mockRejectedValue(new Error('Provider unavailable'));
    await expect(sendNextFreeArticleDoiEmail(db, send, preferences)).rejects.toThrow('Provider unavailable');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', last_error: 'Provider unavailable' }));
  });
  it('does not send without a claimed event', async () => {
    const { db, send } = fixture();
    db.rpc.mockResolvedValue({ data: [], error: null });
    await sendNextFreeArticleDoiEmail(db, send, preferences);
    expect(send).not.toHaveBeenCalled();
  });
});