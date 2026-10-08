import { supabase } from '@/integrations/supabase/client';
import { queryTimeout } from '@/lib/queryTimeout';
import type { Database } from '@/integrations/supabase/types';

type ArticlePatch = Database['public']['Tables']['articles']['Update'];

/** Manuscript writes need a longer deadline than small dashboard reads. */
export async function saveFormattedArticle(articleId: string, patch: ArticlePatch): Promise<void> {
  const { data, error } = await supabase
    .from('articles')
    .update(patch)
    .eq('id', articleId)
    .select('id')
    .abortSignal(queryTimeout(90000))
    .single();

  if (error) {
    if (/abort|timeout|timed out/i.test(`${error.message} ${error.details || ''}`)) {
      throw new Error('The save took too long. Your edits are still in the editor; please try Save Draft again.');
    }
    throw new Error(error.message || 'Could not save the article. Your edits are still in the editor.');
  }
  if (!data) throw new Error('The save was not confirmed. Your edits are still in the editor; please try again.');
}