import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
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
  Brain,
  Atom,
  Zap,
  ArrowRight,
  ImageIcon,
  Edit3,
  X,
} from 'lucide-react';

interface Author {
  name: string;
  affiliation: string;
  email: string;
  isCorresponding?: boolean;
}

interface Figure {
  storagePath: string;
  caption: string;
  insertMode: 'as_is' | 'ai_enhanced';
  kind: 'figure' | 'table';
  previewUrl?: string;
  fileName?: string;
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
  figures: Figure[];
}

const REF_STYLES = ['APA', 'IEEE', 'Harvard'];

function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* ---------- Animated background ---------- */
function AmbientField() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* gradient orbs */}
      <motion.div
        className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, hsl(var(--glow-cyan)/0.6), transparent 60%)' }}
        animate={{ x: [0, 80, -40, 0], y: [0, 60, -30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/3 -right-40 w-[560px] h-[560px] rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, hsl(var(--glow-purple)/0.55), transparent 60%)' }}
        animate={{ x: [0, -60, 40, 0], y: [0, -40, 50, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-0 left-1/3 w-[460px] h-[460px] rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, hsl(var(--glow-pink)/0.5), transparent 60%)' }}
        animate={{ x: [0, 60, -50, 0], y: [0, -30, 30, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--foreground)/0.6) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)/0.6) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
        }}
      />
    </div>
  );
}

/* ---------- Section shell ---------- */
function StepCard({
  step,
  title,
  icon: Icon,
  active = true,
  children,
  delay = 0,
}: {
  step: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="relative group"
    >
      <div
        className={cn(
          'absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none',
          'bg-[conic-gradient(from_var(--angle,0deg),hsl(var(--glow-cyan)/0.4),hsl(var(--glow-purple)/0.4),hsl(var(--glow-pink)/0.4),hsl(var(--glow-cyan)/0.4))]'
        )}
        style={{ filter: 'blur(14px)' }}
      />
      <div
        className={cn(
          'relative rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg))] backdrop-blur-xl p-6 md:p-8 overflow-hidden',
          !active && 'opacity-60'
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <header className="flex items-center gap-4 mb-6">
          <div className="relative">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-glow-cyan/30 via-glow-purple/30 to-glow-pink/30 border border-[hsl(var(--glass-border))] flex items-center justify-center backdrop-blur-md">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background border border-[hsl(var(--glass-border))] text-[10px] font-mono font-bold flex items-center justify-center text-primary">
              {step}
            </span>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80 font-mono">
              Step {String(step).padStart(2, '0')}
            </p>
            <h2 className="font-display text-xl md:text-2xl font-semibold">{title}</h2>
          </div>
        </header>
        {children}
      </div>
    </motion.section>
  );
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

  // Corrections
  const [correctionInstructions, setCorrectionInstructions] = useState('');
  const [pendingFigures, setPendingFigures] = useState<Figure[]>([]);
  const [uploadingFig, setUploadingFig] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  const charCount = material.length;
  const charPct = useMemo(() => Math.min(100, (charCount / 600) * 100), [charCount]);

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
      setArticle({ ...data.article, figures: data.article.figures || [] });
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
      setArticle({ ...data.article, figures: data.article.figures || article?.figures || [] });
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
        createdVia: 'ai_writer',
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
      <div className="relative">
        <AmbientField />

        {/* HERO */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative mb-10 pt-4"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg-strong))] backdrop-blur-md mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              PubPortal AI · Academic Writer
            </span>
          </div>

          <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] tracking-tight max-w-4xl">
            <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
              From raw ideas to a
            </span>{' '}
            <span className="bg-gradient-to-r from-glow-cyan via-glow-purple to-glow-pink bg-clip-text text-transparent animate-[pulse_4s_ease-in-out_infinite]">
              publication-ready paper
            </span>
          </h1>
          <p className="mt-5 text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Drop your notes, hypotheses or data. Our research-grade AI drafts a complete, ethically written academic article — structured, cited, and ready to submit.
          </p>

          {/* feature pills */}
          <div className="mt-7 flex flex-wrap gap-2">
            {[
              { icon: Brain, label: 'Ethical reasoning' },
              { icon: Atom, label: '9-part academic structure' },
              { icon: Zap, label: 'Grammar & citation polish' },
              { icon: FileText, label: 'DOCX export' },
            ].map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.06 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(var(--glass-bg))] border border-[hsl(var(--glass-border))] backdrop-blur-md text-xs text-muted-foreground"
              >
                <f.icon className="w-3.5 h-3.5 text-primary" />
                {f.label}
              </motion.div>
            ))}
          </div>
        </motion.section>

        <div className="space-y-6 pb-12">
          {/* STEP 1 */}
          <StepCard step={1} title="Provide your research material" icon={Sparkles} delay={0.05}>
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="material" className="text-sm">Raw material / prompt *</Label>
                  <span className="text-[11px] font-mono text-muted-foreground">{charCount} chars</span>
                </div>
                <div className="relative group/textarea">
                  <div className="absolute -inset-px rounded-lg bg-gradient-to-r from-glow-cyan/40 via-glow-purple/40 to-glow-pink/40 opacity-0 group-focus-within/textarea:opacity-100 transition-opacity blur-sm pointer-events-none" />
                  <Textarea
                    id="material"
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    placeholder="Paste notes, a topic outline, data observations, hypotheses, draft paragraphs — anything you want the AI to build the article from. The more you provide, the better the result."
                    className="relative glass-input min-h-[200px] resize-y"
                  />
                </div>
                <div className="h-1 w-full rounded-full bg-[hsl(var(--glass-bg))] overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-glow-cyan via-glow-purple to-glow-pink"
                    animate={{ width: `${charPct}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Brain className="w-3 h-3 text-primary" />
                  AI follows academic ethics: it will NOT invent data, results, or references. Missing facts will be asked.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="aw-name" className="text-xs uppercase tracking-wider text-muted-foreground">Author name</Label>
                  <Input id="aw-name" value={authorName} onChange={(e) => setAuthorName(e.target.value)} className="glass-input" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="aw-email" className="text-xs uppercase tracking-wider text-muted-foreground">Corresponding email</Label>
                  <Input id="aw-email" type="email" value={authorEmail} onChange={(e) => setAuthorEmail(e.target.value)} className="glass-input" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="aw-aff" className="text-xs uppercase tracking-wider text-muted-foreground">Institutional affiliation</Label>
                  <Input id="aw-aff" value={affiliation} onChange={(e) => setAffiliation(e.target.value)} className="glass-input" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reference style</Label>
                  <Select value={referenceStyle} onValueChange={setReferenceStyle}>
                    <SelectTrigger className="glass-input"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REF_STYLES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Button
                  onClick={() => handleGenerate(false)}
                  disabled={generating}
                  size="lg"
                  className="relative overflow-hidden bg-gradient-to-r from-glow-cyan via-glow-purple to-glow-pink text-primary-foreground shadow-[0_0_30px_hsl(var(--glow-purple)/0.4)] hover:shadow-[0_0_45px_hsl(var(--glow-purple)/0.6)] transition-shadow group/btn"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000" />
                  {generating ? (
                    <><GlassSpinner size="sm" /> <span className="ml-2">Drafting article…</span></>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" /> Generate Article <ArrowRight className="w-4 h-4 ml-1" /></>
                  )}
                </Button>
              </motion.div>
            </div>
          </StepCard>

          {/* MISSING INFO */}
          <AnimatePresence>
            {questions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
              >
                <div className="relative rounded-2xl border border-yellow-500/30 bg-yellow-500/5 backdrop-blur-xl p-6 overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/60 to-transparent" />
                  <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2 text-yellow-400">
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* STEP 2 — Editable article */}
          <AnimatePresence>
            {article && (
              <StepCard step={2} title="Review, refine & export" icon={FileText}>
                <div className="flex flex-wrap gap-2 mb-6">
                  <Button onClick={handlePolish} disabled={polishing} variant="outline">
                    {polishing ? <GlassSpinner size="sm" /> : <Wand2 className="w-4 h-4 mr-2" />}
                    Check & fix grammar / references
                  </Button>
                  <Button onClick={handleDownload} disabled={downloading} variant="outline">
                    {downloading ? <GlassSpinner size="sm" /> : <Download className="w-4 h-4 mr-2" />}
                    Download DOCX
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="bg-gradient-to-r from-glow-cyan via-glow-purple to-glow-pink text-primary-foreground shadow-[0_0_20px_hsl(var(--glow-purple)/0.35)]"
                  >
                    {submitting ? <GlassSpinner size="sm" /> : <Send className="w-4 h-4 mr-2" />}
                    Use in submission
                  </Button>
                </div>

                {changes.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-5 p-4 rounded-xl bg-green-500/10 border border-green-500/30"
                  >
                    <p className="font-medium text-sm text-green-400 mb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> AI applied {changes.length} fix{changes.length === 1 ? '' : 'es'}
                    </p>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                      {changes.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </motion.div>
                )}

                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Title *</Label>
                    <Input value={article.title} onChange={(e) => updateField('title', e.target.value)} className="glass-input text-lg" />
                  </div>

                  {/* Authors */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Authors</Label>
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
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"
                        >
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
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Abstract</Label>
                    <Textarea value={article.abstract} onChange={(e) => updateField('abstract', e.target.value)} className="glass-input min-h-[140px]" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Keywords (comma separated)</Label>
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
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
                      <Textarea
                        value={article[key] as string}
                        onChange={(e) => updateField(key, e.target.value as any)}
                        className="glass-input min-h-[160px]"
                      />
                    </div>
                  ))}

                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">References ({article.referenceStyle})</Label>
                    <Textarea
                      value={article.references.join('\n')}
                      onChange={(e) => updateField('references', e.target.value.split('\n').map((r) => r.trim()).filter(Boolean))}
                      className="glass-input min-h-[160px] font-mono text-xs"
                      placeholder="One reference per line"
                    />
                  </div>
                </div>
              </StepCard>
            )}
          </AnimatePresence>
        </div>
      </div>
    </DashboardLayout>
  );
}
