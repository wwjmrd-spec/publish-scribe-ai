import React, { useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CaseSensitive, CheckCircle, ChevronDown, ChevronUp, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { saveFormattedArticle } from '@/lib/saveFormattedArticle';
import { resolveEdgeFunctionError } from '@/lib/edgeFunctionError';
import {
  applyTitleToFormattedHtml, formatAcademicTitle, parseTerminology, parseTitlePolicy, readFormattedTitle,
  type StyleGuide, type TermEntry, type TermKind, type TitleMode, type TitlePolicy,
} from '@/lib/academicTitle';

interface Props { article: any; onSaved: () => void }

const MODE_LABELS: Record<TitleMode, string> = {
  title: 'Title Case',
  sentence: 'Sentence case',
  preserve: 'Preserve Original',
  custom: 'Journal policy (custom rules)',
};
const GUIDE_LABELS: Record<StyleGuide, string> = { apa: 'APA 7', chicago: 'Chicago', vancouver: 'Vancouver (NLM)' };
const KIND_LABELS: Record<TermKind, string> = {
  acronym: 'Acronym', proper: 'Name / place', brand: 'Brand / styled term', species: 'Species name', genus: 'Genus', term: 'Other term',
};

const safe = (html: string) => DOMPurify.sanitize(html, { ALLOWED_TAGS: ['em', 'i'], ALLOWED_ATTR: [] });

export function TitleCapitalizationPanel({ article, onSaved }: Props) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<TitleMode>('custom');
  const [guide, setGuide] = useState<StyleGuide>('apa');
  const [aiTerms, setAiTerms] = useState<TermEntry[]>([]);
  const [aiRecs, setAiRecs] = useState<{ type: string; message: string }[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['title-case-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['title_case_policy', 'title_terminology']);
      if (error) throw error;
      const get = (k: string) => data?.find((r) => r.setting_key === k)?.setting_value;
      return { policy: parseTitlePolicy(get('title_case_policy')), terms: parseTerminology(get('title_terminology')) };
    },
  });

  const policy = settings?.policy;
  const journalTerms = settings?.terms || [];
  const currentTitle: string = (article?.title || '').trim();
  const originalTitle: string = (article?.original_title || article?.title || '').trim();
  const formattedHtml: string | null = article?.author_revision_html || article?.formatted_content || null;
  const formattedTitle = useMemo(() => readFormattedTitle(formattedHtml), [formattedHtml]);

  const result = useMemo(
    () => formatAcademicTitle(originalTitle, { mode, styleGuide: guide, policy, terms: [...journalTerms, ...aiTerms] }),
    [originalTitle, mode, guide, policy, journalTerms, aiTerms],
  );

  const isApplied = result.text === currentTitle && (!formattedTitle || formattedTitle === result.text);
  const canRestore = (!!article?.original_title && article.original_title !== currentTitle)
    || (!!formattedTitle && formattedTitle !== originalTitle);

  const writeTitle = async (text: string, html: string, restoring: boolean) => {
    const patch: any = { title: text };
    if (restoring) patch.original_title = null;
    else if (!article.original_title && text !== article.title) patch.original_title = article.title;
    let markupReset = false;
    const previous = [currentTitle, originalTitle, formattedTitle || ''];
    for (const field of ['formatted_content', 'author_revision_html'] as const) {
      if (!article[field]) continue;
      const r = applyTitleToFormattedHtml(article[field], text, html, previous);
      patch[field] = r.html;
      markupReset = markupReset || r.markupReset;
    }
    await saveFormattedArticle(article.id, patch);
    return { markupReset };
  };

  const invalidate = () => {
    onSaved();
    qc.invalidateQueries({ queryKey: ['admin-article-detail', article.id] });
  };

  const acceptMut = useMutation({
    mutationFn: () => writeTitle(result.text, result.html, false),
    onSuccess: (r) => {
      invalidate();
      toast.success(r.markupReset
        ? 'Title updated. The heading’s special formatting was reset — please check it in the editor.'
        : 'Formatted title accepted. The author’s original title is kept and can be restored.');
    },
    onError: (e: any) => toast.error('Could not save the title: ' + e.message),
  });

  const restoreMut = useMutation({
    mutationFn: () => {
      const r = formatAcademicTitle(originalTitle, { mode: 'preserve', terms: journalTerms });
      return writeTitle(originalTitle, r.html, true);
    },
    onSuccess: () => { invalidate(); toast.success('Original title restored.'); },
    onError: (e: any) => toast.error('Could not restore the title: ' + e.message),
  });

  const aiMut = useMutation({
    mutationFn: async () => {
      const r = await supabase.functions.invoke('suggest-title-terms', { body: { title: originalTitle } });
      if (r.error) throw await resolveEdgeFunctionError(r.error, 'The AI check could not run');
      if (r.data?.error) throw new Error(r.data.error);
      return r.data as { terms: { form: string; kind: TermKind }[]; recommendations: { type: string; message: string }[] };
    },
    onSuccess: (d) => {
      setAiTerms((d.terms || []).map((t) => ({ form: t.form, kind: t.kind, italic: t.kind === 'species' || t.kind === 'genus', source: 'ai' as const })));
      setAiRecs(d.recommendations || []);
      toast.success(`AI check found ${d.terms?.length || 0} special term${d.terms?.length === 1 ? '' : 's'}.`);
    },
    onError: (e: any) => toast.error(e.message + ' The built-in rules still apply.'),
  });

  if (!originalTitle) return null;

  return (
    <div className="mt-4 pt-4 border-t border-[hsl(var(--glass-border))] space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <CaseSensitive className="w-4 h-4 text-primary" /> Title Capitalization
        </h4>
        <Button variant="outline" size="sm" onClick={() => aiMut.mutate()} disabled={aiMut.isPending}>
          {aiMut.isPending ? <><GlassSpinner size="sm" className="mr-2" />Checking…</> : <><Sparkles className="w-4 h-4 mr-2" />Check terms with AI</>}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Capitalization style</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as TitleMode)}>
            <SelectTrigger className="glass-input h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(MODE_LABELS) as TitleMode[]).map((m) => <SelectItem key={m} value={m}>{MODE_LABELS[m]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Style guide</Label>
          <Select value={mode === 'custom' ? (policy?.styleGuide || 'chicago') : guide} onValueChange={(v) => setGuide(v as StyleGuide)} disabled={mode === 'custom' || mode === 'preserve'}>
            <SelectTrigger className="glass-input h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(GUIDE_LABELS) as StyleGuide[]).map((g) => <SelectItem key={g} value={g}>{GUIDE_LABELS[g]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="p-3 rounded-lg bg-[hsl(var(--glass-bg))]">
          <p className="text-xs text-muted-foreground mb-1">Original (as submitted)</p>
          <p className="text-sm break-words">{originalTitle}</p>
          {currentTitle !== originalTitle && (
            <p className="text-xs text-muted-foreground mt-2">Current: <span className="text-foreground">{currentTitle}</span></p>
          )}
        </div>
        <div className="p-3 rounded-lg bg-[hsl(var(--glass-bg-strong))] border border-primary/30">
          <p className="text-xs text-muted-foreground mb-1">Formatted preview · {MODE_LABELS[mode]}{mode !== 'preserve' ? ` · ${GUIDE_LABELS[result.styleGuide]}` : ''}</p>
          <p className="text-sm font-semibold break-words" dangerouslySetInnerHTML={{ __html: safe(result.html) }} />
        </div>
      </div>

      {result.changes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.changes.slice(0, 30).map((c, i) => (
            <Badge key={i} variant={c.kind === 'nomenclature' ? 'default' : 'secondary'} className="text-xs font-normal">
              {c.from} → {c.to}{c.kind === 'nomenclature' ? ' (scientific name)' : ''}
            </Badge>
          ))}
        </div>
      )}

      {result.flags.length > 0 && (
        <div className="space-y-1.5">
          {result.flags.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-destructive/10">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <span>Please verify: {f.message}</span>
            </div>
          ))}
        </div>
      )}

      {aiRecs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">AI recommendations (not applied)</p>
          {aiRecs.map((r, i) => (
            <div key={i} className="text-xs p-2 rounded-lg bg-[hsl(var(--glass-bg))]">
              <Badge variant="secondary" className="mr-2 text-[10px] capitalize">{r.type}</Badge>{r.message}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => acceptMut.mutate()} disabled={acceptMut.isPending || isApplied}>
          {acceptMut.isPending ? <><GlassSpinner size="sm" className="mr-2" />Saving…</>
            : <><CheckCircle className="w-4 h-4 mr-2" />{isApplied ? 'Title is up to date' : 'Accept formatted title'}</>}
        </Button>
        <Button variant="outline" size="sm" onClick={() => restoreMut.mutate()} disabled={restoreMut.isPending || !canRestore}>
          {restoreMut.isPending ? <><GlassSpinner size="sm" className="mr-2" />Restoring…</> : <><RotateCcw className="w-4 h-4 mr-2" />Restore original title</>}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowSettings((v) => !v)}>
          {showSettings ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
          Journal policy &amp; terms ({journalTerms.length})
        </Button>
      </div>

      {showSettings && policy && <JournalTitleSettings policy={policy} terms={journalTerms} />}
    </div>
  );
}

function JournalTitleSettings({ policy, terms }: { policy: TitlePolicy; terms: TermEntry[] }) {
  const qc = useQueryClient();
  const [base, setBase] = useState(policy.base);
  const [styleGuide, setStyleGuide] = useState<StyleGuide>(policy.styleGuide);
  const [lower, setLower] = useState(policy.extraLowercase.join(', '));
  const [list, setList] = useState<TermEntry[]>(terms);
  const [newForm, setNewForm] = useState('');
  const [newKind, setNewKind] = useState<TermKind>('acronym');

  const saveMut = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const nextPolicy: TitlePolicy = {
        base, styleGuide,
        extraLowercase: lower.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean),
      };
      const nextTerms = list.map((t) => ({ form: t.form, kind: t.kind }));
      const rows = [
        { setting_key: 'title_case_policy', setting_value: JSON.stringify(nextPolicy), updated_by: user?.id ?? null, updated_at: new Date().toISOString() },
        { setting_key: 'title_terminology', setting_value: JSON.stringify(nextTerms), updated_by: user?.id ?? null, updated_at: new Date().toISOString() },
      ];
      const { error } = await supabase.from('admin_settings').upsert(rows as any, { onConflict: 'setting_key' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['title-case-settings'] });
      toast.success('Journal title policy saved. New formatting runs will use it.');
    },
    onError: (e: any) => toast.error('Could not save: ' + e.message),
  });

  const addTerm = () => {
    const form = newForm.replace(/\s+/g, ' ').trim();
    if (!form) return;
    if (list.some((t) => t.form.toLowerCase() === form.toLowerCase())) { toast.info('That term is already in the list.'); return; }
    setList((l) => [...l, { form, kind: newKind, italic: newKind === 'species' || newKind === 'genus', source: 'journal' }]);
    setNewForm('');
  };

  return (
    <div className="p-3 rounded-lg bg-[hsl(var(--glass-bg))] space-y-3">
      <p className="text-xs text-muted-foreground">Used by “Journal policy” and by automatic formatting of new articles.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Journal style</Label>
          <Select value={base} onValueChange={(v) => setBase(v as TitlePolicy['base'])}>
            <SelectTrigger className="glass-input h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="title">Title Case</SelectItem>
              <SelectItem value="sentence">Sentence case</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Style guide</Label>
          <Select value={styleGuide} onValueChange={(v) => setStyleGuide(v as StyleGuide)}>
            <SelectTrigger className="glass-input h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(GUIDE_LABELS) as StyleGuide[]).map((g) => <SelectItem key={g} value={g}>{GUIDE_LABELS[g]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Extra words to keep small (comma separated)</Label>
        <Input className="glass-input h-9" value={lower} onChange={(e) => setLower(e.target.value)} placeholder="so, yet, via, versus" />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Journal terms (acronyms, names, scientific names)</Label>
        <div className="flex flex-wrap gap-2">
          <Input className="glass-input h-9 flex-1 min-w-[160px]" value={newForm} onChange={(e) => setNewForm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTerm(); } }} placeholder="e.g. NAAC or Bacillus licheniformis" />
          <Select value={newKind} onValueChange={(v) => setNewKind(v as TermKind)}>
            <SelectTrigger className="glass-input h-9 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABELS) as TermKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9" onClick={addTerm}><Plus className="w-4 h-4 mr-1" />Add</Button>
        </div>
        {list.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {list.map((t, i) => (
              <Badge key={`${t.form}-${i}`} variant="secondary" className="text-xs font-normal gap-1">
                <span className={t.italic ? 'italic' : ''}>{t.form}</span>
                <span className="text-muted-foreground">· {KIND_LABELS[t.kind]}</span>
                <button type="button" aria-label={`Remove ${t.form}`} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
      <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
        {saveMut.isPending ? <><GlassSpinner size="sm" className="mr-2" />Saving…</> : 'Save journal policy'}
      </Button>
    </div>
  );
}
