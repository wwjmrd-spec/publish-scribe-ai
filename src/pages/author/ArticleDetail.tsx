import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { PayOptionsDialog } from '@/components/articles/PayOptionsDialog';

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { downloadFromUrl } from '@/lib/downloadFile';
import { formatArticleStatus, getArticleStatusBadgeClass } from '@/lib/articleStatus';
import { GalleyProofReviewSection } from '@/components/articles/GalleyProofReviewSection';
import { CopyrightFormSection } from '@/components/articles/CopyrightFormSection';
import { PublicationCard } from '@/components/articles/PublicationCard';
import {
  ArrowLeft, Award, ChevronDown, Lock, Pencil, Save, Share2, Users, AlertCircle,
} from 'lucide-react';

const PUBLISHED_STATUSES = ['published', 'published_to_wwjmrd', 'updated_published'];
const FREE_EDIT_STATUSES = ['submitted', 'galley_proof_sent', 'galley_proof_revised'];

export default function AuthorArticleDetail() {
  const { articleId } = useParams();
  const { user, isIndian } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
  const [reportPayOpen, setReportPayOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>(null);

  const currency: 'INR' | 'USD' = isIndian ? 'INR' : 'USD';
  const editFee = currency === 'INR' ? 100 : 5;


  const { data: article, isLoading } = useQuery({
    queryKey: ['author-article', articleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', articleId!)
        .maybeSingle();
      if (error) throw error;
      const { data: co } = await supabase
        .from('co_authors')
        .select('id, name, email, affiliation')
        .eq('article_id', articleId!);
      return { ...(data as any), co_authors: co || [] };
    },
    enabled: !!articleId,
  });

  React.useEffect(() => {
    if (article && !form) {
      setForm({
        title: article.title || '',
        abstract: article.abstract || '',
        keywords: (article.keywords || []).join(', '),
        subject: article.subject || '',
        author_name: article.author_name || '',
        co_authors: (article.co_authors || []).map((c: any) => ({ ...c })),
      });
    }
  }, [article, form]);

  const status = article?.status as string | undefined;
  const isPublished = !!status && PUBLISHED_STATUSES.includes(status);
  const locked = article?.allow_author_edit === false;
  const detailsChangedOnce = !!article?.author_details_changed_once;
  const creditsLeft = article?.author_edits_remaining || 0;
  const pendingUpdate = article?.author_update_status === 'pending';

  const canFreeEdit = !locked && !!status && FREE_EDIT_STATUSES.includes(status);
  const canPaidEdit = !locked && isPublished && creditsLeft > 0;
  const canEdit = !pendingUpdate && (canFreeEdit || canPaidEdit);
  const needsPayment = !pendingUpdate && isPublished && creditsLeft <= 0;

  const buildUpdateHtml = () => {
    const rows: string[] = [];
    const add = (label: string, before: string, after: string) => {
      if ((before || '') === (after || '')) return;
      rows.push(
        `<tr><td style="padding:6px 10px;font-weight:600;vertical-align:top">${label}</td>` +
          `<td style="padding:6px 10px;color:#888;text-decoration:line-through;vertical-align:top">${before || '—'}</td>` +
          `<td style="padding:6px 10px;color:#d00;font-weight:600;vertical-align:top">${after || '—'}</td></tr>`,
      );
    };
    add('Title', article.title, form.title);
    add('Abstract', article.abstract, form.abstract);
    add('Keywords', (article.keywords || []).join(', '), form.keywords);
    add('Subject', article.subject, form.subject);
    add('Corresponding Author', article.author_name, form.author_name);
    (form.co_authors || []).forEach((c: any) => {
      const orig = (article.co_authors || []).find((o: any) => o.id === c.id) || {};
      add(`Co-author name (${orig.name || ''})`, orig.name, c.name);
      add(`Co-author email (${orig.name || ''})`, orig.email, c.email);
      add(`Co-author affiliation (${orig.name || ''})`, orig.affiliation, c.affiliation);
    });
    if (!rows.length) return null;
    return (
      `<div class="author-update-diff"><h3 style="color:#d00">Author-requested changes</h3>` +
      `<table style="border-collapse:collapse;width:100%"><thead><tr>` +
      `<th style="text-align:left;padding:6px 10px">Field</th>` +
      `<th style="text-align:left;padding:6px 10px">Current</th>` +
      `<th style="text-align:left;padding:6px 10px;color:#d00">Requested</th>` +
      `</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    );
  };

  const detailsTouched = () => {
    if (!article || !form) return false;
    if ((article.author_name || '') !== form.author_name) return true;
    return (form.co_authors || []).some((c: any) => {
      const o = (article.co_authors || []).find((x: any) => x.id === c.id);
      if (!o) return false;
      return o.name !== c.name || o.email !== c.email || (o.affiliation || '') !== (c.affiliation || '');
    });
  };

  const handleSave = async () => {
    if (!article || !form) return;
    const diffHtml = buildUpdateHtml();
    if (!diffHtml) {
      toast.info('No changes to submit.');
      return;
    }
    const changedPeople = detailsTouched();
    if (changedPeople && detailsChangedOnce) {
      toast.error('Author details can only be changed once. Please ask the admin to enable another edit.');
      return;
    }

    setSaving(true);
    try {
      const update: any = {
        title: form.title,
        abstract: form.abstract,
        keywords: form.keywords.split(',').map((k: string) => k.trim()).filter(Boolean),
        subject: form.subject,
        author_update_html: diffHtml,
        author_update_status: 'pending',
        author_update_submitted_at: new Date().toISOString(),
      };
      if (changedPeople) {
        update.author_name = form.author_name;
        update.author_details_changed_once = true;
        update.allow_author_edit = false;
        update.edit_lock_reason = 'One-time author details change used';
        update.edit_lock_updated_at = new Date().toISOString();
      }
      if (isPublished) {
        update.status = 'update_under_process';
        update.author_edits_remaining = Math.max(0, creditsLeft - 1);
      }

      const { error } = await supabase.from('articles').update(update).eq('id', article.id);
      if (error) throw error;

      if (changedPeople) {
        for (const c of form.co_authors) {
          await supabase
            .from('co_authors')
            .update({ name: c.name, email: c.email, affiliation: c.affiliation })
            .eq('id', c.id);
        }
      }

      toast.success('Changes submitted. An admin will review and approve them.');
      setEditing(false);
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ['author-article', articleId] });
      queryClient.invalidateQueries({ queryKey: ['my-articles', user?.id] });
    } catch (e: any) {
      toast.error('Failed to save changes: ' + (e.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const downloadDoc = async (fileType: string, name: string) => {
    const tid = toast.loading('Preparing file…');
    const res = await supabase.functions.invoke('get-document-url', {
      body: { articleId: article.id, fileType },
    });
    if ((res.data as any)?.paymentRequired) {
      toast.dismiss(tid);
      setReportPayOpen(true);
      return;
    }
    if (res.error || !(res.data as any)?.url) {
      toast.error((res.data as any)?.error || 'Failed to get download link', { id: tid });
      throw new Error('no url');
    }
    toast.success('File ready', { id: tid });
    downloadFromUrl((res.data as any).url, name);
    queryClient.invalidateQueries({ queryKey: ['review-downloads-count', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['author-article', articleId] });
  };


  if (isLoading || !article || !form) {
    return (
      <DashboardLayout type="author">
        <div className="flex items-center justify-center h-64"><GlassSpinner size="lg" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout type="author">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/author/articles')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to My Articles
        </Button>

        {/* Header */}
        <GlassCard>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-bold">{article.title}</h1>
                <p className="text-sm text-muted-foreground">
                  {article.reference_number} · Submitted{' '}
                  {new Date(article.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {locked && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-500/20 text-slate-300 border border-slate-500/30">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-full text-xs border ${getArticleStatusBadgeClass(article.status)}`}>
                  {formatArticleStatus(article.status)}
                </span>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Article details / edit */}
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">Article Details</h2>
            {!editing && (
              canEdit ? (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="w-4 h-4 mr-1" /> Edit Details
                </Button>
              ) : needsPayment ? (
                <Button size="sm" className="gradient-primary" onClick={() => setPayOpen(true)}>
                  <Lock className="w-4 h-4 mr-1" /> Edit — {currency === 'INR' ? '₹100' : '$5'}
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled className="opacity-70">
                  <Lock className="w-4 h-4 mr-1" /> Edit
                </Button>
              )
            )}
          </div>

          {!editing && !canEdit && !needsPayment && (
            <div className="mb-4 flex gap-2 p-3 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sm">
              <AlertCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <p>
                {pendingUpdate
                  ? 'Your requested changes have been submitted and are waiting for admin approval. Editing will re-open once the review is completed.'
                  : 'Your article is in the review process, so it cannot be edited right now. Editing will be available again once the review stage is completed (or after your article is published, where corrections can be unlocked for a small fee).'}
              </p>
            </div>
          )}


          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              {editing ? (
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              ) : (
                <p className="text-sm mt-1">{article.title}</p>
              )}
            </div>
            <div>
              <Label>Abstract</Label>
              {editing ? (
                <Textarea rows={6} value={form.abstract} onChange={(e) => setForm({ ...form, abstract: e.target.value })} />
              ) : (
                <p className="text-sm mt-1 whitespace-pre-wrap text-muted-foreground">{article.abstract || '—'}</p>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Keywords</Label>
                {editing ? (
                  <Input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
                ) : (
                  <p className="text-sm mt-1 text-muted-foreground">{(article.keywords || []).join(', ') || '—'}</p>
                )}
              </div>
              <div>
                <Label>Subject</Label>
                {editing ? (
                  <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                ) : (
                  <p className="text-sm mt-1 text-muted-foreground">{article.subject || '—'}</p>
                )}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Country: </span>{article.country || '—'}</div>
              <div><span className="text-muted-foreground">Publication type: </span>{article.publication_type || '—'}</div>
            </div>
          </div>
        </GlassCard>

        {/* Authors */}
        <GlassCard>
          <h2 className="font-semibold flex items-center gap-2 mb-4"><Users className="w-4 h-4" /> Authors</h2>
          <div className="space-y-3">
            <div>
              <Label>Corresponding Author</Label>
              {editing && !detailsChangedOnce ? (
                <Input value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} />
              ) : (
                <p className="text-sm mt-1">{article.author_name || '—'}</p>
              )}
            </div>
            {(article.co_authors || []).length > 0 && (
              <div className="space-y-2">
                <Label>Co-Authors</Label>
                {form.co_authors.map((c: any, i: number) => (
                  <div key={c.id} className="p-3 rounded-lg bg-[hsl(var(--glass-bg))] space-y-2">
                    {editing && !detailsChangedOnce ? (
                      <div className="grid sm:grid-cols-3 gap-2">
                        <Input
                          value={c.name}
                          placeholder="Name"
                          onChange={(e) => {
                            const next = [...form.co_authors];
                            next[i] = { ...c, name: e.target.value };
                            setForm({ ...form, co_authors: next });
                          }}
                        />
                        <Input
                          value={c.email}
                          placeholder="Email"
                          onChange={(e) => {
                            const next = [...form.co_authors];
                            next[i] = { ...c, email: e.target.value };
                            setForm({ ...form, co_authors: next });
                          }}
                        />
                        <Input
                          value={c.affiliation || ''}
                          placeholder="Affiliation"
                          onChange={(e) => {
                            const next = [...form.co_authors];
                            next[i] = { ...c, affiliation: e.target.value };
                            setForm({ ...form, co_authors: next });
                          }}
                        />
                      </div>
                    ) : (
                      <div className="text-sm">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-muted-foreground">{c.email}</p>
                        {c.affiliation && <p className="text-xs text-muted-foreground">{c.affiliation}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Permission notice + save */}
          {editing && (
            <div className="mt-5 space-y-3">
              <div className="flex gap-2 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-sm">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  {detailsChangedOnce ? (
                    <p>You have already used your one-time change of author details. To change author or co-author information again, please request the admin to enable editing for this article.</p>
                  ) : (
                    <p>Author and co-author details can be changed <strong>only once</strong>. After you save, this article's editing permission is disabled automatically and further changes need admin approval.</p>
                  )}
                  {isPublished && (
                    <p>This article is published. You have <strong>{creditsLeft}</strong> paid edit save(s) remaining. Your changes will be reviewed by the admin and the status becomes <strong>Update Under Process</strong>.</p>
                  )}
                  <p>Every change you save is sent to the admin for review and is highlighted in red on the formatted article.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} className="gradient-primary">
                  {saving ? <GlassSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-1" />}
                  Save Changes
                </Button>
                <Button variant="ghost" onClick={() => { setEditing(false); setForm(null); }}>Cancel</Button>
              </div>
            </div>
          )}

          {!editing && pendingUpdate && (
            <div className="mt-4 p-3 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sm">
              Your requested changes were submitted and are awaiting admin approval.
            </div>
          )}
          {!editing && !pendingUpdate && needsPayment && (
            <div className="mt-4 p-3 rounded-lg border border-primary/40 bg-primary/10 text-sm">
              This article is published. Corrections cost {currency === 'INR' ? '₹100' : '$5'} and unlock <strong>2 saves</strong>.
            </div>
          )}
        </GlassCard>

        {/* Documents */}
        <GlassCard>
          <h2 className="font-semibold mb-4">Documents</h2>
          <div className="flex flex-wrap gap-2">
            {article.document_url && (
              <DownloadButton size="sm" variant="outline" onDownload={() => downloadDoc('document', `${article.reference_number}.docx`)}>
                Manuscript
              </DownloadButton>
            )}
            {article.review_report_url && (
              <DownloadButton size="sm" onDownload={() => downloadDoc('review_report', `review-report-${article.reference_number}.pdf`)}>
                Review Report
              </DownloadButton>
            )}
            {article.certificate_url && (
              <Button size="sm" variant="outline" onClick={() => navigate('/author/certificates')}>
                <Award className="w-4 h-4 mr-1" /> Certificate
              </Button>
            )}
          </div>
        </GlassCard>

        {article.galley_proof_status && <GalleyProofReviewSection article={article} />}

        <CopyrightFormSection article={article} />

        {['published', 'published_to_wwjmrd', 'updated_published', 'galley_proof_sent', 'manuscript_accepted'].includes(article.status) && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between border-primary/30 text-primary hover:bg-primary/10">
                <span className="flex items-center gap-2"><Share2 className="w-4 h-4" /> Publication Card & Share</span>
                <ChevronDown className="w-4 h-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <PublicationCard
                article={{
                  id: article.id,
                  reference_number: article.reference_number,
                  title: article.title,
                  author_id: article.author_id,
                  author_name: article.author_name,
                  country: article.country,
                  publication_year: article.publication_year,
                  volume: article.volume,
                  issue: article.issue,
                  page_number: article.page_number,
                  published_link: article.published_link,
                  keywords: article.keywords,
                  abstract: article.abstract,
                }}
              />
            </CollapsibleContent>
          </Collapsible>
        )}
      </motion.div>

      <AlertDialog open={payOpen} onOpenChange={(o) => !o && setPayOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pay to edit a published article</AlertDialogTitle>
            <AlertDialogDescription>
              This article is already published. Corrections require a fee of{' '}
              <span className="font-semibold text-foreground">{currency === 'INR' ? '₹100' : '$5'}</span>, which unlocks{' '}
              <span className="font-semibold text-foreground">2 saves</span> for this article. Editing becomes available only
              after the payment is received successfully, and your changes still need admin approval before republishing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={paying}
              onClick={(e) => { e.preventDefault(); payForEdit(); }}
            >
              {paying ? <><GlassSpinner size="sm" className="mr-2" />Processing…</> : `Pay ${currency === 'INR' ? '₹100' : '$5'}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
