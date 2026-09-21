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
import { joinName, splitName } from '@/lib/nameParts';
import { GalleyProofReviewSection } from '@/components/articles/GalleyProofReviewSection';
import { CopyrightFormSection } from '@/components/articles/CopyrightFormSection';
import { PublicationCard } from '@/components/articles/PublicationCard';
import { FeePromiseBadge } from '@/components/articles/FeePromiseBadge';
import {
  ArrowLeft, Award, ChevronDown, Lock, Pencil, Plus, Save, Share2, Users, AlertCircle, X, Link2, CheckCircle2,
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
  const [doiPayOpen, setDoiPayOpen] = React.useState(false);

  const { data: doiFees } = useQuery({
    queryKey: ['doi-fees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('publication_fees_public' as any)
        .select('indian_doi_fee, international_doi_fee')
        .maybeSingle();
      return data as any;
    },
  });

  const doiInr = Number(doiFees?.indian_doi_fee ?? 500);
  const doiUsd = Number(doiFees?.international_doi_fee ?? 10);
  const doiFee = currency === 'INR' ? doiInr : doiUsd;
  const doiPriceLabel = currency === 'INR' ? `₹${doiInr}` : `$${doiUsd}`;



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
        .select('id, first_name, last_name, name, email, affiliation, orcid')
        .eq('article_id', articleId!);
      return { ...(data as any), co_authors: co || [] };
    },
    enabled: !!articleId,
  });

  const { data: profile } = useQuery({
    queryKey: ['author-profile-affiliation', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('affiliation')
        .eq('id', user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  React.useEffect(() => {
    if (article && !form) {
      setForm({
        title: article.title || '',
        abstract: article.abstract || '',
        keywords: (article.keywords || []).join(', '),
        subject: article.subject || '',
        author_name: article.author_name || '',
        author_affiliation: profile?.affiliation || '',
        co_authors: (article.co_authors || []).map((c: any) => {
          const fallback = splitName(c.name);
          return {
            ...c,
            first_name: c.first_name || fallback.firstName,
            last_name: c.last_name || fallback.lastName,
          };
        }),
      });
    }
  }, [article, form, profile]);

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
    add('Corresponding Author Affiliation', profile?.affiliation || '', form.author_affiliation);
    (form.co_authors || []).forEach((c: any, i: number) => {
      const orig = (article.co_authors || []).find((o: any) => o.id === c.id);
      if (!orig) {
        add(
          `New co-author #${i + 1}`,
          '',
           [joinName(c.first_name, c.last_name), c.email, c.affiliation].filter(Boolean).join(' · '),
        );
        return;
      }
       const origParts = splitName(orig.name);
       add(`Co-author first name (${orig.name || ''})`, orig.first_name || origParts.firstName, c.first_name);
       add(`Co-author last name (${orig.name || ''})`, orig.last_name || origParts.lastName, c.last_name);
      add(`Co-author email (${orig.name || ''})`, orig.email, c.email);
      add(`Co-author affiliation (${orig.name || ''})`, orig.affiliation, c.affiliation);
    });
    (article.co_authors || []).forEach((o: any) => {
      if (!(form.co_authors || []).some((c: any) => c.id === o.id)) {
        add('Removed co-author', [o.name, o.email].filter(Boolean).join(' · '), 'Removed');
      }
    });
    if (
      (article.co_authors || []).length !== (form.co_authors || []).length
    ) {
      add(
        'Number of co-authors',
        String((article.co_authors || []).length),
        String((form.co_authors || []).length),
      );
    }
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
    if ((profile?.affiliation || '') !== (form.author_affiliation || '')) return true;
    if ((article.co_authors || []).length !== (form.co_authors || []).length) return true;
    if ((article.co_authors || []).some((o: any) => !(form.co_authors || []).some((c: any) => c.id === o.id)))
      return true;
    return (form.co_authors || []).some((c: any) => {
      const o = (article.co_authors || []).find((x: any) => x.id === c.id);
      if (!o) return true;
       const parts = splitName(o.name);
       return (o.first_name || parts.firstName) !== c.first_name ||
         (o.last_name || parts.lastName) !== c.last_name ||
         o.email !== c.email || (o.affiliation || '') !== (c.affiliation || '');
    });
  };

  const handleSave = async () => {
    if (!article || !form) return;
    const newCoAuthors = (form.co_authors || []).filter((c: any) => !c.id);
     if (newCoAuthors.some((c: any) => !c.first_name?.trim() || !c.last_name?.trim() || !c.email?.trim())) {
       toast.error('Every new co-author needs a first name, last name, and email.');
      return;
    }
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
        // Affiliation of the corresponding author lives on the profile
        if ((profile?.affiliation || '') !== (form.author_affiliation || '')) {
          await supabase
            .from('profiles')
            .update({ affiliation: (form.author_affiliation || '').slice(0, 200) })
            .eq('id', user!.id);
        }

        const removed = (article.co_authors || []).filter(
          (o: any) => !(form.co_authors || []).some((c: any) => c.id === o.id),
        );
        for (const o of removed) {
          await supabase.from('co_authors').delete().eq('id', o.id);
        }
        for (const c of form.co_authors) {
          if (c.id) {
            await supabase
              .from('co_authors')
               .update({
                 first_name: c.first_name.trim(),
                 last_name: c.last_name.trim(),
                 name: joinName(c.first_name, c.last_name),
                 email: c.email,
                 affiliation: c.affiliation,
                 orcid: c.orcid?.trim() || null,
               })
              .eq('id', c.id);
          } else {
            await supabase.from('co_authors').insert({
              article_id: article.id,
               first_name: c.first_name.trim(),
               last_name: c.last_name.trim(),
               name: joinName(c.first_name, c.last_name),
              email: c.email.trim(),
              affiliation: (c.affiliation || '').trim() || null,
               orcid: c.orcid?.trim() || null,
            });
          }
        }
      }

      toast.success('Changes submitted. An admin will review and approve them.');
      setEditing(false);
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ['author-article', articleId] });
      queryClient.invalidateQueries({ queryKey: ['author-profile-affiliation', user?.id] });
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
                <FeePromiseBadge
                  article={article as any}
                  onSaved={() => queryClient.invalidateQueries({ queryKey: ['author-article', articleId] })}
                />
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
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Corresponding Author</Label>
                {editing && !detailsChangedOnce ? (
                  <Input value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} />
                ) : (
                  <p className="text-sm mt-1">{article.author_name || '—'}</p>
                )}
              </div>
              <div>
                <Label>Affiliation</Label>
                {editing && !detailsChangedOnce ? (
                  <Input
                    value={form.author_affiliation}
                    placeholder="University / Institute"
                    onChange={(e) => setForm({ ...form, author_affiliation: e.target.value })}
                  />
                ) : (
                  <p className="text-sm mt-1 text-muted-foreground">{profile?.affiliation || '—'}</p>
                )}
              </div>
            </div>

            {((form.co_authors || []).length > 0 || (editing && !detailsChangedOnce)) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Co-Authors ({(form.co_authors || []).length})</Label>
                  {editing && !detailsChangedOnce && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setForm({
                          ...form,
                           co_authors: [...(form.co_authors || []), { first_name: '', last_name: '', name: '', email: '', affiliation: '', orcid: '' }],
                        })
                      }
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add Co-Author
                    </Button>
                  )}
                </div>
                {(form.co_authors || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No co-authors on this article.</p>
                )}
                {form.co_authors.map((c: any, i: number) => (
                  <div key={c.id || `new-${i}`} className="p-3 rounded-lg bg-[hsl(var(--glass-bg))] space-y-2">
                    {editing && !detailsChangedOnce ? (
                      <div className="flex items-start gap-2">
                         <div className="grid sm:grid-cols-2 gap-2 flex-1">
                          <Input
                             value={c.first_name || ''}
                             placeholder="First name"
                            onChange={(e) => {
                              const next = [...form.co_authors];
                               next[i] = { ...c, first_name: e.target.value };
                              setForm({ ...form, co_authors: next });
                            }}
                          />
                           <Input
                             value={c.last_name || ''}
                             placeholder="Last name"
                             onChange={(e) => {
                               const next = [...form.co_authors];
                               next[i] = { ...c, last_name: e.target.value };
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
                           <Input
                             value={c.orcid || ''}
                             placeholder="ORCID iD"
                             onChange={(e) => {
                               const next = [...form.co_authors];
                               next[i] = { ...c, orcid: e.target.value };
                               setForm({ ...form, co_authors: next });
                             }}
                           />
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Remove co-author"
                          onClick={() =>
                            setForm({
                              ...form,
                              co_authors: form.co_authors.filter((_: any, idx: number) => idx !== i),
                            })
                          }
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="text-sm">
                         <p className="font-medium">{joinName(c.first_name, c.last_name) || c.name}</p>
                         <p className="text-xs text-muted-foreground">First name: {c.first_name || '—'}</p>
                         <p className="text-xs text-muted-foreground">Last name: {c.last_name || '—'}</p>
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
          <div className="space-y-3">
            <h2 className="font-semibold flex items-center gap-2 text-primary">
              <Share2 className="w-4 h-4" /> Publication Card & Share
            </h2>
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
          </div>
        )}

        {/* DOI */}
        <GlassCard>
          <h2 className="font-semibold mb-2 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" /> DOI (Digital Object Identifier)
          </h2>
          {article.doi_number ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Your article has a registered DOI:</p>
              <p className="font-mono text-sm text-primary break-all">{article.doi_number}</p>
            </div>
          ) : article.doi_paid ? (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-muted-foreground">
                DOI fee received. Your DOI is being registered and will appear here shortly.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Get a permanent DOI link for this article for{' '}
                <span className="font-semibold text-foreground">{doiPriceLabel}</span>. A DOI makes your work
                easier to cite, index and discover.
              </p>
              <Button size="sm" className="gradient-primary" onClick={() => setDoiPayOpen(true)}>
                <Link2 className="w-4 h-4 mr-1" /> Get DOI for this article — {doiPriceLabel}
              </Button>
            </div>
          )}
        </GlassCard>
      </motion.div>

      <PayOptionsDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        title="Pay to edit a published article"
        description={
          <>
            This article is already published. Corrections require a fee of{' '}
            <span className="font-semibold text-foreground">{currency === 'INR' ? '₹100' : '$5'}</span>, which unlocks{' '}
            <span className="font-semibold text-foreground">2 saves</span>. Editing opens only after the payment is
            received, and your changes still need admin approval before republishing.
          </>
        }
        items={[{ type: 'article_edit', articleId: article.id }]}
        inrAmount={100}
        usdAmount={5}
        cartItem={{
          id: `article_edit-${article.id}`,
          type: 'article_edit',
          label: `Article edit credits — ${article.reference_number}`,
          description: 'Unlocks 2 saves for corrections on a published article',
          amount: editFee,
          articleId: article.id,
        }}

        onPaid={() => {
          queryClient.invalidateQueries({ queryKey: ['author-article', articleId] });
          toast.success('Editing unlocked for 2 saves.');
          setEditing(true);
        }}
      />

      <PayOptionsDialog
        open={reportPayOpen}
        onOpenChange={setReportPayOpen}
        title="Review report download"
        description={
          <>
            You have used your <span className="font-semibold text-foreground">2 free lifetime</span> review-report
            downloads. Pay {currency === 'INR' ? '₹100' : '$5'} to download this report, or upgrade to Pro for 10
            downloads every month.
          </>
        }
        items={[{ type: 'review_report', articleId: article.id }]}
        inrAmount={100}
        usdAmount={5}
        cartItem={{
          id: `review_report-${article.id}`,
          type: 'review_report',
          label: `Review report — ${article.reference_number}`,
          description: 'One review-report download for this article',
          amount: editFee,
          articleId: article.id,
        }}

        onPaid={() => {
          queryClient.invalidateQueries({ queryKey: ['author-article', articleId] });
          downloadDoc('review_report', `review-report-${article.reference_number}.pdf`).catch(() => {});
        }}
        extraAction={
          <Button variant="outline" onClick={() => navigate('/author/subscription')}>Upgrade to Pro</Button>
        }
      />

      <PayOptionsDialog
        open={doiPayOpen}
        onOpenChange={setDoiPayOpen}
        title="Get a DOI for this article"
        description={
          <>
            A DOI is a permanent link to your published article. Fee:{' '}
            <span className="font-semibold text-foreground">{doiPriceLabel}</span>. Once paid, our team registers the
            DOI and it appears on this page and in your article record.
          </>
        }
        items={[{ type: 'doi', articleId: article.id }]}
        inrAmount={doiInr}
        usdAmount={doiUsd}
        cartItem={{
          id: `doi-${article.id}`,
          type: 'doi',
          label: `DOI — ${article.reference_number}`,
          description: 'DOI registration for this article',
          amount: doiFee,
          articleId: article.id,
        }}
        onPaid={() => {
          queryClient.invalidateQueries({ queryKey: ['author-article', articleId] });
          toast.success('DOI payment received. We will register your DOI shortly.');
        }}
      />


    </DashboardLayout>
  );
}
