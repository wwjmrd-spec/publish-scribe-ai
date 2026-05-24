import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { downloadFromUrl } from '@/lib/downloadFile';

interface DownloadOptions {
  articleId?: string;
  fileType: string;
  fileName?: string;
  label?: string;
}

/**
 * Fetches a signed URL via the get-document-url edge function and triggers
 * a browser download, showing a sonner toast.promise spinner throughout.
 * Returns the response data for callers that need to react to quota errors.
 */
export async function downloadDocument(opts: DownloadOptions): Promise<{ ok: boolean; data?: any; error?: any }> {
  const label = opts.label || 'file';
  const promise = (async () => {
    const response = await supabase.functions.invoke('get-document-url', {
      body: {
        articleId: opts.articleId,
        fileType: opts.fileType,
        fileName: opts.fileName,
      },
    });
    if (response.error || !response.data?.url) {
      const msg =
        (response.data as any)?.error ||
        (response.error as any)?.message ||
        'Failed to get download link';
      throw new Error(msg);
    }
    downloadFromUrl(response.data.url);
    return response.data;
  })();

  toast.promise(promise, {
    loading: `Preparing ${label}…`,
    success: `${label.charAt(0).toUpperCase()}${label.slice(1)} ready`,
    error: (e) => e?.message || `Failed to download ${label}`,
  });

  try {
    const data = await promise;
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error };
  }
}
