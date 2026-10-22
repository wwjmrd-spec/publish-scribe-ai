import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { jsPDF } from 'npm:jspdf@2.5.2';
import { renderAcceptanceLetter } from '../_shared/acceptanceLetterPdf.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const schema = z.object({ articleId: z.string().uuid() });
const accepted = new Set(['manuscript_accepted', 'pending_fee', 'paid', 'free', 'copyright_received', 'galley_proof_sent', 'galley_proof_approved', 'galley_proof_revised', 'published', 'published_to_wwjmrd', 'update_under_process', 'updated_published']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_ANON_KEY');
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key || !service) throw new Error('Letter service is not configured');
    const authorization = req.headers.get('Authorization') || '';
    const auth = createClient(url, key, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await auth.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);
    const db = createClient(url, service);
    const { data: isAdmin, error: roleError } = await db.rpc('has_role', { _user_id: userData.user.id, _role: 'admin' });
    if (roleError || !isAdmin) return json({ error: 'Admin access required' }, 403);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'A valid article ID is required' }, 400);
    const { articleId } = parsed.data;
    const { data: article, error } = await db.from('articles').select('id, title, reference_number, author_name, author_affiliation, country, status, profiles:author_id(full_name, affiliation, country), co_authors(name, first_name, last_name)').eq('id', articleId).single();
    if (error || !article) return json({ error: 'Article not found' }, 404);
    if (!accepted.has(article.status || '')) return json({ error: 'Accept the manuscript before creating its acceptance letter.' }, 400);
    const { data: existing } = await db.from('article_acceptance_letters').select('file_path').eq('article_id', articleId).maybeSingle();
    if (existing) return json({ success: true });
    const profile = article.profiles as any;
    const name = article.author_name?.trim() || profile?.full_name || '';
    const date = new Date();
    const acceptanceDate = date.toISOString().slice(0, 10);
    const letterNumber = `WWJMRD/${article.reference_number}/${date.getUTCFullYear()}`;
    const filePath = `acceptance-letters/${articleId}.pdf`;
    const pdf = renderAcceptanceLetter(new jsPDF({ unit: 'mm', format: 'a4' }), {
      letterNumber, acceptanceDate: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }),
      authorName: name, affiliation: (article as any).author_affiliation || profile?.affiliation || '', country: article.country || profile?.country || '',
      reference: article.reference_number, title: article.title,
      authors: [name, ...(article.co_authors || []).map((c: any) => [c.first_name, c.last_name].filter(Boolean).join(' ') || c.name)].filter(Boolean),
    });
    const { error: uploadError } = await db.storage.from('certificates').upload(filePath, pdf, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw new Error('Could not store the acceptance letter. Please retry.');
    const { error: saveError } = await db.from('article_acceptance_letters').insert({ article_id: articleId, letter_number: letterNumber, acceptance_date: acceptanceDate, file_path: filePath, created_by: userData.user.id });
    if (saveError && saveError.code !== '23505') throw saveError;
    return json({ success: true });
  } catch (error) {
    console.error('Acceptance letter generation failed', error);
    return json({ error: error instanceof Error ? error.message : 'Could not create acceptance letter' }, 500);
  }
});