import { supabase } from '@/integrations/supabase/client';
import { buildFormattedPdfBlob } from './exportFormattedArticle';
import type { PaginationOptions } from './formattedArticlePagination';

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

/**
 * Builds the finalised formatted-article PDF and uploads it over FTP to
 * wwjmrd.com/upload2, named `article-title_1234.pdf`. Returns the public URL,
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

  const response = await supabase.functions.invoke('upload-article-pdf', {
    body: { articleId, pdfBase64 },
  });
  if (response.error) throw new Error(response.error.message);
  if (!response.data?.success) throw new Error(response.data?.error || 'PDF upload failed');

  return { url: response.data.url as string, fileName: response.data.fileName as string };
}
