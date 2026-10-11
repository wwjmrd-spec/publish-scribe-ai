import { getUnsubscribeUrl, isCategoryEnabled } from './emailPreferences.ts';

/** Deliver one acceptance event per scheduler invocation; never a recipient-list send. */
export async function sendNextFreeArticleDoiEmail(db: any, send: (to: string, template: string, data: Record<string, unknown>) => Promise<void>) {
  const { data: events, error } = await db.rpc('claim_article_doi_fee_email_event');
  if (error) throw error;
  const event = events?.[0];
  if (!event) return;
  const finish = async (values: Record<string, unknown>) => {
    const { error } = await db.from('article_doi_fee_email_events').update(values).eq('article_id', event.article_id);
    if (error) throw error;
  };
  try {
    const { data: article, error: articleError } = await db.from('articles')
      .select('id, title, reference_number, author_id, doi_paid, status, profiles:author_id(full_name, email, country, is_indian)')
      .eq('id', event.article_id).maybeSingle();
    if (articleError) throw articleError;
    if (!article || article.doi_paid || ['withdrawn', 'rejected'].includes(article.status)) {
      await finish({ status: 'skipped', last_error: null });
      return;
    }
    if (!(await isCategoryEnabled(db, article.author_id, 'fee_reminder'))) {
      await finish({ status: 'skipped', last_error: 'Fee emails disabled by author' });
      return;
    }
    const profile = article.profiles;
    if (!profile?.email) throw new Error('Author email is missing');
    const indian = profile.country?.trim().toLowerCase() === 'india' || (!profile.country && profile.is_indian);
    const unsubscribeUrl = await getUnsubscribeUrl(db, article.author_id, 'fee_reminder');
    await send(profile.email, 'free-article-doi-fee', {
      articleId: article.id, authorName: profile.full_name || 'Author', articleTitle: article.title,
      referenceNumber: article.reference_number, doiFeeLabel: indian ? 'Rs 500 (INR)' : '$10 (USD)',
      articleUrl: `https://wwjmrdai.online/author/articles/${article.id}`,
      unsubscribeUrl, unsubscribeLabel: 'DOI fee request emails',
    });
    await finish({ status: 'sent', sent_at: new Date().toISOString(), last_error: null });
  } catch (error) {
    await finish({ status: 'pending', available_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), last_error: error instanceof Error ? error.message : 'Email delivery failed' });
    throw error;
  }
}