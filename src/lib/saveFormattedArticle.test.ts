import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), queryTimeout: vi.fn(), signal: {} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/queryTimeout', () => ({ queryTimeout: mocks.queryTimeout }));
import { saveFormattedArticle } from './saveFormattedArticle';

describe('formatted article saves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryTimeout.mockReturnValue(mocks.signal);
  });

  function response(result: unknown) {
    const builder = {
      update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(), single: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockResolvedValue(result),
    };
    mocks.from.mockReturnValue(builder);
    return builder;
  }

  it('uses a fresh 90-second signal and confirms the saved row without flattening markup', async () => {
    const builder = response({ data: { id: 'article' }, error: null });
    const patch = { formatted_content: '<p>H<sub>2</sub>O E=mc<sup>2</sup></p>', page_number: '12-14' };
    await saveFormattedArticle('article', patch);
    expect(mocks.queryTimeout).toHaveBeenCalledWith(90000);
    expect(builder.abortSignal).toHaveBeenCalledWith(mocks.signal);
    expect(builder.update).toHaveBeenCalledWith(patch);
    expect(builder.eq).toHaveBeenCalledWith('id', 'article');
    expect(builder.select).toHaveBeenCalledWith('id');
  });

  it('explains a timeout without claiming edits were saved', async () => {
    response({ data: null, error: { message: 'AbortError: signal is aborted without reason' } });
    await expect(saveFormattedArticle('article', {})).rejects.toThrow('Your edits are still in the editor');
  });

  it('preserves permission errors', async () => {
    response({ data: null, error: { message: 'Permission denied' } });
    await expect(saveFormattedArticle('article', {})).rejects.toThrow('Permission denied');
  });

  it('does not report success when no saved row is returned', async () => {
    response({ data: null, error: null });
    await expect(saveFormattedArticle('article', {})).rejects.toThrow('not confirmed');
  });
});