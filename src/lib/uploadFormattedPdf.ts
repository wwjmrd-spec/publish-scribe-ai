import { supabase } from '@/integrations/supabase/client';
import { buildFormattedPdfBlob } from './exportFormattedArticle';
import type { PaginationOptions } from './formattedArticlePagination';
import { resolveEdgeFunctionError } from './edgeFunctionError';

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

const isNoResponseError = (error: any) =>
  error?.name === 'FunctionsFetchError' || /Failed to send a request/i.test(error?.message || '');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The upload can finish on the server even when the browser loses the reply
 * (slow or unstable connections). Confirm it from the saved upload time,
 * which only the upload service writes after the file is verified online.
 */
export async function waitForConfirmedUpload(
  articleId: string,
  startedAt: number,
  { timeoutMs = 60_000, intervalMs = 4_000 } = {},
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabase
      .from('articles')
      .select('published_pdf_url, published_pdf_uploaded_at')
      .eq('id', articleId)
      .maybeSingle();
    const at = (data as any)?.published_pdf_uploaded_at as string | null | undefined;
    const url = (data as any)?.published_pdf_url as string | null | undefined;
    // Allow small clock differences between this device and the server.
    if (at && url && new Date(at).getTime() >= startedAt - 120_000) return url;
    await sleep(intervalMs);
  }
  return null;
}

/**
 * Builds the finalised formatted-article PDF and uploads it over FTP to the
 * journal website, named `article-title_1234.pdf`. Returns the public URL,
 * which the WWJMRD publish API call then uses as the article file link.
 */
export async function uploadFormattedPdfToWwjmrd(
  articleId: string,
  options: PaginationOptions = {},
): Promise<{ url: string; fileName: string }> {
  const { data, error } = await supabase
    .from('articles')
    .select('formatted_content, author_revision_html')
    .eq('id', articleId)
    .maybeSingle();
  if (error) throw error;

  const html = ((data as any)?.author_revision_html || (data as any)?.formatted_content || '') as string;
  if (!html) throw new Error('No formatted article content found. Format the article first.');

  const blob = await buildFormattedPdfBlob(html, options);
  const pdfBase64 = await blobToBase64(blob);

  const startedAt = Date.now();
  const response = await supabase.functions.invoke('upload-article-pdf', {
    body: { articleId, pdfBase64 },
  });
  if (response.error) {
    if (isNoResponseError(response.error)) {
      const url = await waitForConfirmedUpload(articleId, startedAt);
      if (url) return { url, fileName: url.split('/').pop() || '' };
    }
    throw await resolveEdgeFunctionError(response.error, 'PDF upload failed');
  }
  if (!response.data?.success) throw new Error(response.data?.error || 'PDF upload failed');

  return { url: response.data.url as string, fileName: response.data.fileName as string };
}
