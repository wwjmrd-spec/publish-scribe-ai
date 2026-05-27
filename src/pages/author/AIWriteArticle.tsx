import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  Wand2,
  Download,
  Send,
  HelpCircle,
  Plus,
  Trash2,
  CheckCircle2,
  FileText,
} from 'lucide-react';

interface Author {
  name: string;
  affiliation: string;
  email: string;
  isCorresponding?: boolean;
}

interface Article {
  title: string;
  authors: Author[];
  abstract: string;
  keywords: string[];
  introduction: string;
  methodology: string;
  resultsAndDiscussion: string;
  conclusion: string;
  references: string[];
  referenceStyle: string;
}

const REF_STYLES = ['APA', 'IEEE', 'Harvard'];

function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export default function AIWriteArticle() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [material, setMaterial] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState(user?.email || '');
  const [affiliation, setAffiliation] = useState('');
  const [referenceStyle, setReferenceStyle] = useState('APA');

  const [generating, setGenerating] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [article, setArticle] = useState<Article | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [changes, setChanges] = useState<string[]>([]);

  const updateField = <K extends keyof Article>(key: K, value: Article[K]) => {
    if (!article) return;
    setArticle({ ...article, [key]: value });
  };

  const updateAuthor = (i: number, patch: Partial<Author>) => {
    if (!article) return;
    const next = [...article.authors];
    next[i] = { ...next[i], ...patch };
    setArticle({ ...article, authors: next });
  };

  const handleGenerate = async (withAnswers = false) => {
    if (material.trim().length < 30) {
      toast({ title: 'More material needed', description: 'Please provide at least 30 characters describing your research.', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    setChanges([]);
    try {
      const { data, error } = await supabase.functions.invoke('ai-write-article', {
        body: {
          mode: 'generate',
          material,
          authorName,
          authorEmail,
          affiliation,
          referenceStyle,
          answers: withAnswers ? answers : undefined,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Generation failed');
      setArticle(data.article);
      setQuestions(data.missingInfo || []);
      toast({ title: 'Article drafted ✨', description: 'Review each section and edit anything that needs your attention.' });
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handlePolish = async () => {
    if (!article) return;
    setPolishing(true);
    setChanges([]);
    try {
      const { data, error } = await supabase.functions.invoke('ai-write-article', {
        body: { mode: 'polish', article },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Polish failed');
      setArticle(data.article);
      setChanges(data.changes || []);
      toast({ title: 'Polished ✅', description: 'Grammar, spelling and references have been refined.' });
    } catch (e: any) {
      toast({ title: 'Polish failed', description: e.message, variant: 'destructive' });
    } finally {
      setPolishing(false);
    }
  };

  const handleDownload = async () => {
    if (!article) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-write-article', {
        body: { mode: 'build_docx', article },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Build failed');
      const blob = b64ToBlob(data.docxBase64, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(article.title || 'article').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: 'Download failed', description: e.message, variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  const handleSubmit = async () => {
    if (!article) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-write-article', {
        body: { mode: 'upload_for_submit', article },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Upload failed');
      sessionStorage.setItem('ai-article-prefill', JSON.stringify({
        documentPath: data.documentPath,
        ...data.metadata,
      }));
      toast({ title: 'Ready to submit', description: 'Your AI-written article was prepared. Complete the submission form.' });
      navigate('/author/submit');
    } catch (e: any) {
      toast({ title: 'Submit prep failed', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout type="author">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2 flex items-center gap-2">
          <Wand2 className="w-7 h-7 text-primary" />
          AI Article Writer
        </h1>
        <p className="text-muted-foreground">
          Provide raw research material and let AI draft a complete, ethically written academic article.
        </p>
      </motion.div>

      {/* Input */}
      <GlassCard className="mb-6">
        <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Step 1 — Provide research material
        </h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="material">Raw material / prompt *</Label>
            <Textarea
              id="material"
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder="Paste notes, a topic outline, data observations, hypotheses, draft paragraphs — anything you want the AI to build the article from. The more you provide, the better the result."
              className="glass-input min-h-[180px]"
            />
            <p className="text-xs text-muted-foreground">
              AI follows academic ethics: it will NOT invent data, results, or references. Missing facts will be asked.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="aw-name">Author name</Label>
              <Input id="aw-name" value={authorName} onChange={(e) => setAuthorName(e.target.value)} className="glass-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aw-email">Corresponding email</Label>
              <Input id="aw-email" type="email" value={authorEmail} onChange={(e) => setAuthorEmail(e.target.value)} className="glass-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aw-aff">Institutional affiliation</Label>
              <Input id="aw-aff" value={affiliation} onChange={(e) => setAffiliation(e.target.value)} className="glass-input" />
            </div>
            <div className="space-y-2">
              <Label>Reference style</Label>
              <Select value={referenceStyle} onValueChange={setReferenceStyle}>
                <SelectTrigger className="glass-input"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REF_STYLES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={() => handleGenerate(false)} disabled={generating} className="gradient-primary">
            {generating ? <><GlassSpinner size="sm" /> <span className="ml-2">Drafting article…</span></> : <><Sparkles className="w-4 h-4 mr-2" /> Generate Article</>}
          </Button>
        </div>
      </GlassCard>

      {/* Missing info */}
      {questions.length > 0 && (
        <GlassCard className="mb-6 border-yellow-500/30">
          <h3 className="font-display text-lg font-semibold mb-3 flex items-center gap-2 text-yellow-500">
            <HelpCircle className="w-5 h-5" />
            We need a few more details
          </h3>
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={i} className="space-y-1.5">
                <Label className="text-sm">{q}</Label>
                <Textarea
                  value={answers[q] || ''}
                  onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
                  className="glass-input min-h-[60px]"
                />
              </div>
            ))}
            <Button onClick={() => handleGenerate(true)} disabled={generating} variant="outline">
              {generating ? <GlassSpinner size="sm" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Re-generate with my answers
            </Button>
          </div>
        </GlassCard>
      )}

      {/* Editable article */}
      {article && (
        <GlassCard className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-display text-xl font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Step 2 — Review & edit
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handlePolish} disabled={polishing} variant="outline">
                {polishing ? <GlassSpinner size="sm" /> : <Wand2 className="w-4 h-4 mr-2" />}
                Check & fix grammar / references
              </Button>
              <Button onClick={handleDownload} disabled={downloading} variant="outline">
                {downloading ? <GlassSpinner size="sm" /> : <Download className="w-4 h-4 mr-2" />}
                Download DOCX
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className="gradient-primary">
                {submitting ? <GlassSpinner size="sm" /> : <Send className="w-4 h-4 mr-2" />}
                Use in submission
              </Button>
            </div>
          </div>

          {changes.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <p className="font-medium text-sm text-green-400 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> AI applied {changes.length} fix{changes.length === 1 ? '' : 'es'}
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                {changes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={article.title} onChange={(e) => updateField('title', e.target.value)} className="glass-input" />
            </div>

            {/* Authors */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Authors</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => updateField('authors', [...article.authors, { name: '', affiliation: '', email: '' }])}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add author
                </Button>
              </div>
              <div className="space-y-2">
                {article.authors.map((au, i) => (
                  <div key={i} className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                    <Input placeholder="Name" value={au.name} onChange={(e) => updateAuthor(i, { name: e.target.value })} className="glass-input" />
                    <Input placeholder="Affiliation" value={au.affiliation} onChange={(e) => updateAuthor(i, { affiliation: e.target.value })} className="glass-input" />
                    <Input placeholder="Email" value={au.email} onChange={(e) => updateAuthor(i, { email: e.target.value })} className="glass-input" />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => updateField('authors', article.authors.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Abstract</Label>
              <Textarea value={article.abstract} onChange={(e) => updateField('abstract', e.target.value)} className="glass-input min-h-[140px]" />
            </div>

            <div className="space-y-2">
              <Label>Keywords (comma separated)</Label>
              <Input
                value={article.keywords.join(', ')}
                onChange={(e) => updateField('keywords', e.target.value.split(',').map((k) => k.trim()).filter(Boolean))}
                className="glass-input"
              />
            </div>

            {([
              ['Introduction', 'introduction'],
              ['Methodology', 'methodology'],
              ['Results and Discussion', 'resultsAndDiscussion'],
              ['Conclusion', 'conclusion'],
            ] as const).map(([label, key]) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Textarea
                  value={article[key] as string}
                  onChange={(e) => updateField(key, e.target.value as any)}
                  className="glass-input min-h-[160px]"
                />
              </div>
            ))}

            <div className="space-y-2">
              <Label>References ({article.referenceStyle})</Label>
              <Textarea
                value={article.references.join('\n')}
                onChange={(e) => updateField('references', e.target.value.split('\n').map((r) => r.trim()).filter(Boolean))}
                className="glass-input min-h-[160px] font-mono text-xs"
                placeholder="One reference per line"
              />
            </div>
          </div>
        </GlassCard>
      )}
    </DashboardLayout>
  );
}
