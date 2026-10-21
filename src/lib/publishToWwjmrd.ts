import { supabase } from '@/integrations/supabase/client';
import { uploadFormattedPdfToWwjmrd } from './uploadFormattedPdf';
import { resolveEdgeFunctionError } from './edgeFunctionError';

/**
 * Uploads the final PDF to the journal website, then publishes the article.
 * If the upload fails, the admin is asked whether to publish anyway with the
 * stored Cloud PDF link (the earlier behaviour). Declining stops publishing.
 */
export async function publishArticleToWwjmrd(
  articleId: string,
  mode?: 'update',
  confirmCloudFallback: (reason: string) => boolean = (reason) =>
    window.confirm(
      `The PDF could not be uploaded to wwjmrd.com:\n\n${reason}\n\nPublish anyway using the stored Cloud PDF link instead?`,
    ),
) {
  let allowCloudPdf = false;
  try {
    await uploadFormattedPdfToWwjmrd(articleId);
  } catch (e: any) {
    const reason = e?.message || 'PDF upload failed';
    if (!confirmCloudFallback(reason)) throw new Error(reason);
    allowCloudPdf = true;
  }

  const { data, error } = await supabase.functions.invoke('publish-to-wwjmrd', {
    body: { articleId, ...(mode ? { mode } : {}), ...(allowCloudPdf ? { allowCloudPdf: true } : {}) },
  });
  if (error) throw await resolveEdgeFunctionError(error, 'Publish failed');
  if (!data?.success) throw new Error(data?.error || 'Publish failed');
  return data;
}
