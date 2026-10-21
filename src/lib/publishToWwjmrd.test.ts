import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upload: vi.fn(), invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('./uploadFormattedPdf', () => ({ uploadFormattedPdfToWwjmrd: mocks.upload }));
import { publishArticleToWwjmrd } from './publishToWwjmrd';

describe('publishing to WWJMRD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({ error: null, data: { success: true } });
  });

  it('publishes with the journal PDF when the upload succeeds', async () => {
    mocks.upload.mockResolvedValue({ url: 'https://wwjmrd.com/pdf/a_0001.pdf', fileName: 'a_0001.pdf' });
    await publishArticleToWwjmrd('art', undefined, () => true);
    expect(mocks.invoke).toHaveBeenCalledWith('publish-to-wwjmrd', { body: { articleId: 'art' } });
  });

  it('publishes with the Cloud PDF link when the upload fails and the admin agrees', async () => {
    mocks.upload.mockRejectedValue(new Error('PDF upload failed: the server did not respond.'));
    await publishArticleToWwjmrd('art', undefined, () => true);
    expect(mocks.invoke).toHaveBeenCalledWith('publish-to-wwjmrd', { body: { articleId: 'art', allowCloudPdf: true } });
  });

  it('does not publish when the upload fails and the admin declines the Cloud link', async () => {
    mocks.upload.mockRejectedValue(new Error('PDF upload failed'));
    await expect(publishArticleToWwjmrd('art', undefined, () => false)).rejects.toThrow('PDF upload failed');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
