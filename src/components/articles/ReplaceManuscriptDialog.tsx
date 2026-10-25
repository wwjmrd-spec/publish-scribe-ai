import React from 'react';
import mammoth from 'mammoth';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Sparkles, Plus, Trash2, FileText, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { extractDocxPageCountFromArrayBuffer } from '@/lib/docxPageCount';
import { joinName, splitName } from '@/lib/nameParts';

interface CoAuthorRow {
  key: string;
  first_name: string;
  last_name: string;
  email: string;
  affiliation: string;
  orcid: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: any;
  coAuthors: any[];
  isAdmin: boolean;
  /** Query keys to refresh after a successful replacement. */
  invalidateKeys?: unknown[][];
}

const emptyForm = (article: any, coAuthors: any[]) => ({
  title: article?.title || '',
  author_name: article?.author_name || '',
  author_affiliation: article?.author_affiliation || '',
  abstract: article?.abstract || '',
  keywords: (article?.keywords || []).join(', '),
  subject: article?.subject || '',
  reason_of_research: article?.reason_of_research || '',
  page_count: article?.page_count ? String(article.page_count) : '',
  co_authors: (coAuthors || []).map((c: any): CoAuthorRow => {
    const parts = splitName(c.name);
    return {
      key: c.id || crypto.randomUUID(),
      first_name: c.first_name || parts.firstName,
      last_name: c.last_name || parts.lastName,
      email: c.email || '',
      affiliation: c.affiliation || '',
      orcid: c.orcid || '',
    };
  }),
});

export function ReplaceManuscriptDialog({ open, onOpenChange, article, coAuthors, isAdmin, invalidateKeys = [] }: Props) {
  const qc = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [scanned, setScanned] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [replaceCoAuthors, setReplaceCoAuthors] = React.useState(false);
  const [form, setForm] = React.useState(() => emptyForm(article, coAuthors));

  const formattingDone = ['ready_for_review', 'approved'].includes(article?.formatting_status) || !!article?.formatted_content;

  React.useEffect(() => {
    if (open) {
      setFile(null);
      setScanned(false);
      setReplaceCoAuthors(false);
      setForm(emptyForm(article, coAuthors));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (field: string, value: string) => setForm((f: any) => ({ ...f, [field]: value }));

  const scanFile = async (f: File) => {
    setScanning(true);
    setProgress(15);
    try {
      const buf = await f.arrayBuffer();
      const [{ value: text }, pageCount] = await Promise.all([
        mammoth.extractRawText({ arrayBuffer: buf }),
        extractDocxPageCountFromArrayBuffer(buf),
      ]);
      setProgress(45);
      if ((text || '').trim().length < 50) {
        toast.error('The file looks empty, so the AI could not read it. Please check the details below by hand.');
        if (pageCount) set('page_count', String(pageCount));
        return;
      }
      const { data, error } = await supabase.functions.invoke('scan-article', {
        body: { text: text.trim(), docxPageCount: pageCount },
      });
      setProgress(90);
      const meta = data?.metadata;
      if (error || !meta) {
        toast.warning('The AI scan could not read every detail. Please check the details below.');
        if (pageCount) set('page_count', String(pageCount));
        return;
      }
      setForm((prev: any) => {
        const scannedName = (meta.author_name || joinName(meta.author_first_name || '', meta.author_last_name || '')).trim();
        const next = {
          ...prev,
          title: meta.title || prev.title,
          abstract: meta.abstract || prev.abstract,
          keywords: meta.keywords || prev.keywords,
          subject: meta.subject || prev.subject,
          reason_of_research: meta.reason_of_research || prev.reason_of_research,
          author_name: scannedName || prev.author_name,
          author_affiliation: meta.author_affiliation ? String(meta.author_affiliation).trim() : prev.author_affiliation,
          page_count: meta.page_count ? String(meta.page_count) : pageCount ? String(pageCount) : prev.page_count,
        };
        if (Array.isArray(meta.co_authors) && meta.co_authors.length > 0) {
          next.co_authors = meta.co_authors.map((ca: any): CoAuthorRow => {
            const parts = splitName(ca.name || joinName(ca.first_name, ca.last_name));
            return {
              key: crypto.randomUUID(),
              first_name: ca.first_name || parts.firstName,
              last_name: ca.last_name || parts.lastName,
              email: ca.email || '',
              affiliation: ca.affiliation || '',
              orcid: ca.orcid || '',
            };
          });
          setReplaceCoAuthors(true);
        }
        return next;
      });
      setProgress(100);
      toast.success('AI scan complete — please check the details before saving.');
    } catch (e: any) {
      toast.error('Could not read this file: ' + (e?.message || 'unknown error'));
    } finally {
      setScanned(true);
      setScanning(false);
      setProgress(0);
    }
  };

  const onPickFile = (f: File | null) => {
    if (!f) return;
    if (!/\.docx$/i.test(f.name)) {
      toast.error('Please choose a Word .docx file. Old .doc files cannot be formatted.');
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      toast.error('The file must be 25 MB or smaller.');
      return;
    }
    setFile(f);
    scanFile(f);
  };

  const updateCo = (key: string, field: keyof CoAuthorRow, value: string) =>
    setForm((f: any) => ({
      ...f,
      co_authors: f.co_authors.map((c: CoAuthorRow) => (c.key === key ? { ...c, [field]: value } : c)),
    }));

  const submit = async () => {
    if (!file) return toast.error('Please choose the updated manuscript file.');
    if (form.title.trim().length < 3) return toast.error('Please enter the article title.');
    const cos = (form.co_authors as CoAuthorRow[]).filter((c) => joinName(c.first_name, c.last_name));
    if (replaceCoAuthors && !isAdmin && cos.some((c) => !c.email.trim())) {
      return toast.error('Please enter an email address for every co-author.');
    }
    setSaving(true);
    try {
      const payload = {
        articleId: article.id,
        title: form.title.trim(),
        abstract: form.abstract,
        keywords: form.keywords.split(',').map((k: string) => k.trim()).filter(Boolean).slice(0, 20),
        subject: form.subject,
        reason_of_research: form.reason_of_research,
        author_name: form.author_name,
        author_affiliation: form.author_affiliation.slice(0, 300),
        page_count: form.page_count ? Math.max(1, parseInt(form.page_count, 10) || 0) || null : null,
        replace_co_authors: replaceCoAuthors,
        co_authors: cos.map((c) => ({
          first_name: c.first_name.trim(),
          last_name: c.last_name.trim(),
          name: joinName(c.first_name, c.last_name),
          email: c.email.trim(),
          affiliation: c.affiliation.trim(),
          orcid: c.orcid.trim(),
        })),
      };
      const fd = new FormData();
      fd.append('file', file);
      fd.append('payload', JSON.stringify(payload));
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Please sign in again.');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/replace-manuscript`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.error) throw new Error(body?.error || `Upload failed (${res.status})`);

      if (body.needs_reformat) {
        toast.success(
          isAdmin
            ? 'New manuscript saved. Formatting was already done — click Re-format to format the new file.'
            : 'Your updated manuscript was saved. The editorial office will format the new file.',
          { duration: 8000 },
        );
      } else if (body.formatting_started) {
        toast.success('New manuscript saved and formatting of the new file has started.');
      } else {
        toast.success('New manuscript saved.');
        if (body.formatting_error && isAdmin) toast.warning('Formatting did not start: ' + body.formatting_error);
      }
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['admin-article-formatting', article.id] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Could not upload the new manuscript');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="glass-card-strong max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="gradient-text">Upload Updated Manuscript</DialogTitle>
          <DialogDescription>
            The new file replaces the old manuscript file. The AI reads the new file and fills in the details below; check and correct them before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-border/60 cursor-pointer hover:border-primary/60 transition-colors text-center">
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              disabled={scanning || saving}
              onChange={(e) => onPickFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <>
                <FileText className="w-8 h-8 text-primary" />
                <span className="text-sm font-medium break-all">{file.name}</span>
                <span className="text-xs text-muted-foreground">Click to choose a different file</span>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm font-medium">Choose the updated manuscript (.docx, up to 25 MB)</span>
              </>
            )}
          </label>

          {scanning && (
            <div className="text-center space-y-2">
              <p className="text-sm flex items-center justify-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> AI is reading the new file…</p>
              <Progress value={progress} className="h-2 max-w-xs mx-auto" />
            </div>
          )}

          <div className="p-3 rounded-lg border border-border/50 bg-muted/20 text-xs text-muted-foreground flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              {formattingDone
                ? 'This article is already formatted. After saving, click Re-format in Article Formatting to format the new file.'
                : 'This article is not formatted yet, so the new file will be formatted automatically after saving.'}
              {' '}The article status and review report stay as they are.
            </span>
          </div>

          {file && !scanning && scanned && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Article Title</Label>
                <Input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={500} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Main Author (as written on the article)</Label>
                  <Input value={form.author_name} onChange={(e) => set('author_name', e.target.value)} maxLength={200} />
                </div>
                <div className="space-y-1">
                  <Label>Main Author Affiliation</Label>
                  <Input value={form.author_affiliation} onChange={(e) => set('author_affiliation', e.target.value)} maxLength={300} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Abstract</Label>
                <Textarea rows={5} value={form.abstract} onChange={(e) => set('abstract', e.target.value)} maxLength={10000} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Keywords (comma separated)</Label>
                  <Input value={form.keywords} onChange={(e) => set('keywords', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Subject</Label>
                  <Input value={form.subject} onChange={(e) => set('subject', e.target.value)} maxLength={200} />
                </div>
              </div>
              <div className="grid sm:grid-cols-[1fr_140px] gap-3">
                <div className="space-y-1">
                  <Label>Reason of Research</Label>
                  <Input value={form.reason_of_research} onChange={(e) => set('reason_of_research', e.target.value)} maxLength={2000} />
                </div>
                <div className="space-y-1">
                  <Label>Pages</Label>
                  <Input type="number" min={1} value={form.page_count} onChange={(e) => set('page_count', e.target.value)} />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-border/50">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={replaceCoAuthors} onCheckedChange={(v) => setReplaceCoAuthors(v === true)} />
                  Replace the co-author list with the co-authors below
                </label>
                {replaceCoAuthors && (
                  <div className="space-y-3">
                    {(form.co_authors as CoAuthorRow[]).map((c, i) => (
                      <div key={c.key} className="p-3 rounded-lg border border-border/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground">Co-Author {i + 1}</span>
                          <Button
                            type="button" variant="ghost" size="sm"
                            onClick={() => setForm((f: any) => ({ ...f, co_authors: f.co_authors.filter((x: CoAuthorRow) => x.key !== c.key) }))}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <Input placeholder="First name" value={c.first_name} onChange={(e) => updateCo(c.key, 'first_name', e.target.value)} maxLength={100} />
                          <Input placeholder="Last name" value={c.last_name} onChange={(e) => updateCo(c.key, 'last_name', e.target.value)} maxLength={100} />
                          <Input placeholder={isAdmin ? 'Email (optional)' : 'Email'} type="email" value={c.email} onChange={(e) => updateCo(c.key, 'email', e.target.value)} maxLength={254} />
                          <Input placeholder="Affiliation" value={c.affiliation} onChange={(e) => updateCo(c.key, 'affiliation', e.target.value)} maxLength={300} />
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button" variant="outline" size="sm"
                      onClick={() => setForm((f: any) => ({
                        ...f,
                        co_authors: [...f.co_authors, { key: crypto.randomUUID(), first_name: '', last_name: '', email: '', affiliation: '', orcid: '' }],
                      }))}
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add Co-Author
                    </Button>
                    {(form.co_authors as CoAuthorRow[]).length === 0 && (
                      <p className="text-xs text-muted-foreground">With no co-authors listed, all current co-authors are removed.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!file || scanning || saving || !scanned} className="gradient-primary">
            {saving ? <><GlassSpinner size="sm" className="mr-2" />Saving…</> : <><Upload className="w-4 h-4 mr-2" />Replace Manuscript</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
