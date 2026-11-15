import { describe, expect, it, vi } from 'vitest';
import { collectAuthorProfilePages } from './adminAuthorProfiles';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

describe('complete admin author totals', () => {
  it('counts all 1326 profiles rather than stopping at 1000', async () => {
    const profiles = Array.from({ length: 1326 }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: profiles.slice(from, to + 1), error: null,
    }));
    const result = await collectAuthorProfilePages(fetchPage);
    expect(result).toHaveLength(1326);
    expect(result[1325]).toEqual({ id: 1325 });
    expect(fetchPage.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });

  it('fails rather than returning a misleading partial author count', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('Unavailable') });
    await expect(collectAuthorProfilePages(fetchPage)).rejects.toThrow('Unavailable');
  });
});