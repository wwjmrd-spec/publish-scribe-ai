import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  UserPlus, FileUp, Loader2, Upload, FileText, CheckCircle, Sparkles,
  Plus, X, Mail, User, Building, ShieldCheck, ArrowRight, ArrowLeft,
} from 'lucide-react';
import mammoth from 'mammoth';
import { extractDocxPageCountFromArrayBuffer } from '@/lib/docxPageCount';
import { extractTextFromLegacyDoc } from '@/lib/legacyDoc';
import { joinName, splitName } from '@/lib/nameParts';

interface AdminCoAuthor {
  id: string;
  /** Derived from firstName + lastName. */
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  affiliation: string;
  orcid: string;
  verificationSent: boolean;
  skipVerification: boolean;
}

async function extractTextFromDocx(buf: ArrayBuffer) {
  const r = await mammoth.extractRawText({ arrayBuffer: buf });
  return r.value.trim();
}

type Step = 1 | 2 | 3;

export default function AdminSubmitForAuthor() {
  const queryClient = useQueryClient();

  // --- Create Author state ---
  const [cEmail, setCEmail] = useState('');
  const [cPassword, setCPassword] = useState('');
  const [cFirstName, setCFirstName] = useState('');
  const [cLastName, setCLastName] = useState('');
  const cFullName = joinName(cFirstName, cLastName);
  const [cCountry, setCCountry] = useState('');
  const [cAffiliation, setCAffiliation] = useState('');
  const [cIsIndian, setCIsIndian] = useState<'auto' | 'yes' | 'no'>('auto');
  const [creating, setCreating] = useState(false);

  // --- Submit wizard state ---
  const [step, setStep] = useState<Step>(1);
  const [authorId, setAuthorId] = useState('');
  const [authorSearch, setAuthorSearch] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [keywords, setKeywords] = useState('');
  const [subject, setSubject] = useState('');
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState('');
  const [pubType, setPubType] = useState<'normal' | 'fast_track'>('normal');
  const [coAuthors, setCoAuthors] = useState<AdminCoAuthor[]>([]);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState('');

  const { data: authors } = useQuery({
    queryKey: ['admin-all-authors-min'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  const filteredAuthors = (authors || []).filter((a) => {
    const q = authorSearch.toLowerCase().trim();
    if (!q) return true;
    return a.full_name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q);
  }).slice(0, 50);

  const [generatedTemp, setGeneratedTemp] = useState<{ email: string; password: string } | null>(null);

  const handleCreateAuthor = async () => {
    if (!cEmail || !cFirstName.trim() || !cLastName.trim()) {
      toast.error('Email, first name and last name are required');
      return;
    }
    setCreating(true);
    setGeneratedTemp(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-author', {
        body: {
          email: cEmail.trim(),
          // Leave blank to let the function generate a temporary password and
          // force the author to reset + verify on first login.
          ...(cPassword ? { password: cPassword } : {}),
          full_name: cFullName.trim(),
          first_name: cFirstName.trim(),
          last_name: cLastName.trim(),
          country: cCountry.trim() || 'Unknown',
          affiliation: cAffiliation.trim(),
          is_indian: cIsIndian === 'auto' ? undefined : cIsIndian === 'yes',
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const tempPwd = (data as any)?.temp_password as string | null;
      if (tempPwd) {
        setGeneratedTemp({ email: cEmail.trim(), password: tempPwd });
        toast.success('Author account created. Temporary password emailed and shown below.');
      } else {
        toast.success('Author account created');
      }
      setCEmail(''); setCPassword(''); setCFirstName(''); setCLastName(''); setCCountry(''); setCAffiliation(''); setCIsIndian('auto');
      queryClient.invalidateQueries({ queryKey: ['admin-all-authors-min'] });
      queryClient.invalidateQueries({ queryKey: ['admin-authors'] });
    } catch (e: any) {
      toast.error('Failed to create author: ' + (e?.message || e));
    } finally {
      setCreating(false);
    }
  };

  // --- Wizard helpers ---
  const resetWizard = () => {
    setStep(1); setAuthorId(''); setAuthorSearch(''); setFile(null);
    setTitle(''); setAbstract(''); setKeywords(''); setSubject('');
    setReason(''); setTarget(''); setPubType('normal'); setCoAuthors([]);
    setNotificationEmail(''); setPageCount(null); setSubmittedRef('');
  };

  const handleScan = async () => {
    if (!authorId) { toast.error('Select an author first'); return; }
    if (!file) { toast.error('Upload a manuscript file'); return; }
    const lower = file.name.toLowerCase();
    const isDocx = lower.endsWith('.docx');
    const isLegacyDoc = lower.endsWith('.doc');
    if (!isDocx && !isLegacyDoc) {
      toast.message('Automatic scan supports .docx and .doc — fill details manually.');
      setStep(2);
      return;
    }

    setScanning(true); setScanProgress(15);
    try {
      const buf = await file.arrayBuffer();
      setScanProgress(35);
      let text = '';
      let pc: number | null = null;
      if (isLegacyDoc) {
        text = extractTextFromLegacyDoc(buf);
      } else {
        [text, pc] = await Promise.all([
          extractTextFromDocx(buf),
          extractDocxPageCountFromArrayBuffer(buf),
        ]);
      }
      setScanProgress(55);
      if (text.length < 50) {
        toast.message('Document looks empty — fill details manually.');
        setStep(2); return;
      }
      const { data, error } = await supabase.functions.invoke('scan-article', {
        body: { text, docxPageCount: pc },
      });
      setScanProgress(90);
      if (error || !data?.metadata) {
        toast.message('AI scan limited — please review the form.');
        setStep(2); return;
      }
      const m = data.metadata;
      if (m.title) setTitle(m.title);
      if (m.abstract) setAbstract(m.abstract);
      if (m.keywords) setKeywords(m.keywords);
      if (m.subject) setSubject(m.subject);
      if (m.reason_of_research) setReason(m.reason_of_research);
      if (m.page_count) setPageCount(m.page_count);
      if (Array.isArray(m.co_authors) && m.co_authors.length > 0) {
        setCoAuthors(m.co_authors.map((ca: any) => ({
          id: crypto.randomUUID(),
          name: ca.name || '',
          email: ca.email || '',
          affiliation: ca.affiliation || '',
          orcid: ca.orcid || '',
          verificationSent: false,
          skipVerification: false,
        })));
      }
      setScanProgress(100);
      toast.success('AI scan complete ✨');
      setStep(2);
    } catch (e: any) {
      console.error(e);
      toast.error('Scan failed — fill details manually');
      setStep(2);
    } finally {
      setScanning(false); setScanProgress(0);
    }
  };

  const addCoAuthor = () => setCoAuthors((p) => [
    ...p, { id: crypto.randomUUID(), name: '', email: '', affiliation: '', orcid: '', verificationSent: false, skipVerification: false },
  ]);
  const removeCoAuthor = (id: string) => setCoAuthors((p) => p.filter((c) => c.id !== id));
  const updateCoAuthor = (id: string, field: keyof AdminCoAuthor, value: any) =>
    setCoAuthors((p) => p.map((c) => (c.id === id ? { ...c, [field]: value } : c)));

  const sendCoAuthorVerification = async (ca: AdminCoAuthor) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!ca.email.trim() || !emailRegex.test(ca.email.trim())) {
      toast.error('Enter a valid co-author email first'); return;
    }
    if (!title.trim()) { toast.error('Add the article title first'); return; }
    try {
      const subjectText = `Please confirm co-authorship: ${title.trim()}`;
      const html = `
        <div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0a0e27;">
          <h2 style="color:#1a1f3a;">Co-Author Confirmation Required</h2>
          <p>Hello ${ca.name || 'Co-Author'},</p>
          <p>You have been listed as a co-author on the following manuscript being submitted to PubPortal:</p>
          <p style="padding:12px 16px;background:#f4f6fb;border-radius:8px;"><strong>${title.trim()}</strong></p>
          <p>If this is correct, please reply to this email to confirm. If you did not consent to being listed, please reply and let us know.</p>
          <p style="color:#666;font-size:13px;">— PubPortal Editorial Team</p>
        </div>`;
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: ca.email.trim(),
          template: 'custom',
          subject: subjectText,
          html,
          isAdmin: false,
        },
      });
      if (error) throw error;
      updateCoAuthor(ca.id, 'verificationSent', true);
      toast.success(`Verification email sent to ${ca.email}`);
    } catch (e: any) {
      toast.error('Failed to send verification: ' + (e?.message || e));
    }
  };

  const handleSubmitArticle = async () => {
    if (!authorId) { toast.error('Select an author'); return; }
    if (!title.trim() || title.trim().length < 3) { toast.error('Enter a title'); return; }
    if (!file) { toast.error('Attach the manuscript file'); return; }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const filledCoAuthors = coAuthors.filter((c) => c.name.trim() || c.email.trim());
    for (const c of filledCoAuthors) {
      if (!c.name.trim()) { toast.error('Co-author name is required'); return; }
      if (!c.email.trim() || !emailRegex.test(c.email.trim())) {
        toast.error(`Invalid email for co-author: ${c.name || '(unnamed)'}`); return;
      }
    }
    if (notificationEmail.trim() && !emailRegex.test(notificationEmail.trim())) {
      toast.error('Invalid notification email'); return;
    }

    setSubmitting(true);
    try {
      const payload = {
        author_id: authorId,
        title: title.trim(),
        abstract: abstract.trim(),
        keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
        subject: subject.trim(),
        reason_of_research: reason.trim(),
        submission_target: target.trim(),
        publication_type: pubType,
        co_authors: filledCoAuthors.map((c) => ({
          name: c.name.trim(), email: c.email.trim(), affiliation: c.affiliation.trim(), orcid: (c.orcid || '').trim(),
        })),
        notification_email: notificationEmail.trim() || null,
      };
      const fd = new FormData();
      fd.append('file', file);
      fd.append('payload', JSON.stringify(payload));

      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-submit-article`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Submission failed');
      }
      toast.success(`Article submitted (${data.reference_number})`);
      setSubmittedRef(data.reference_number);
      setStep(3);
    } catch (e: any) {
      toast.error('Failed: ' + (e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const stepDots = [
    { label: 'Upload & Scan', icon: Upload },
    { label: 'Review & Co-Authors', icon: FileText },
    { label: 'Done', icon: CheckCircle },
  ];

  return (
    <DashboardLayout type="admin">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2">Author & Submission Tools</h1>
        <p className="text-muted-foreground">Create author accounts and submit articles on their behalf, just like authors do.</p>
      </motion.div>

      <Tabs defaultValue="submit" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="submit"><FileUp className="w-4 h-4 mr-2" /> Submit Article</TabsTrigger>
          <TabsTrigger value="create"><UserPlus className="w-4 h-4 mr-2" /> Create Author</TabsTrigger>
        </TabsList>

        <TabsContent value="submit">
          {/* Stepper */}
          <div className="flex items-center justify-center gap-4 mb-6">
            {stepDots.map((s, idx) => {
              const n = (idx + 1) as Step;
              const Icon = s.icon;
              const active = step === n;
              const done = step > n;
              return (
                <div key={idx} className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border ${
                    active ? 'bg-primary text-primary-foreground border-primary'
                    : done ? 'bg-green-500/20 text-green-500 border-green-500/40'
                    : 'bg-[hsl(var(--glass-bg))] text-muted-foreground border-[hsl(var(--glass-border))]'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-sm hidden sm:inline ${active ? 'font-semibold' : 'text-muted-foreground'}`}>{s.label}</span>
                  {idx < stepDots.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              );
            })}
          </div>

          {step === 1 && (
            <GlassCard>
              <div className="space-y-5">
                <div>
                  <Label>Select Author *</Label>
                  <Input
                    placeholder="Search by name or email..."
                    value={authorSearch}
                    onChange={(e) => setAuthorSearch(e.target.value)}
                    className="glass-input mt-1 mb-2"
                  />
                  <Select value={authorId} onValueChange={setAuthorId}>
                    <SelectTrigger className="glass-input"><SelectValue placeholder="Pick an author" /></SelectTrigger>
                    <SelectContent>
                      {filteredAuthors.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.full_name} — {a.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Manuscript File (.docx recommended; .doc and .pdf supported)</Label>
                  <div className="mt-2 border-2 border-dashed border-[hsl(var(--glass-border))] rounded-xl p-6 text-center hover:border-primary/50 transition-colors relative">
                    {file ? (
                      <div className="flex items-center justify-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="font-medium">{file.name}</span>
                        <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                        <Button variant="ghost" size="icon" onClick={() => setFile(null)}><X className="w-4 h-4" /></Button>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm">Click or drop a .docx / .doc / .pdf file</p>
                        <input
                          type="file"
                          accept=".docx,.doc,.pdf"
                          onChange={(e) => setFile(e.target.files?.[0] || null)}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </>
                    )}
                  </div>
                </div>

                {scanning && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                      AI scanning manuscript...
                    </div>
                    <Progress value={scanProgress} />
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => { setStep(2); }} disabled={!file || !authorId}>
                    Skip AI Scan
                  </Button>
                  <Button onClick={handleScan} disabled={!file || !authorId || scanning} className="gradient-primary">
                    {scanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    Scan & Extract Details
                  </Button>
                </div>
              </div>
            </GlassCard>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <GlassCard>
                <h2 className="font-display text-xl font-semibold mb-5 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" /> Article Details
                </h2>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Title *</Label>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} className="glass-input mt-1" />
                    </div>
                    <div>
                      <Label>Subject</Label>
                      <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="glass-input mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label>Abstract</Label>
                    <Textarea value={abstract} onChange={(e) => setAbstract(e.target.value)} rows={4} className="glass-input mt-1" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Keywords (comma separated)</Label>
                      <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} className="glass-input mt-1" />
                    </div>
                    <div>
                      <Label>Submission Target</Label>
                      <Input value={target} onChange={(e) => setTarget(e.target.value)} className="glass-input mt-1" placeholder="e.g. WWJMRD" />
                    </div>
                  </div>
                  <div>
                    <Label>Reason of Research</Label>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="glass-input mt-1" />
                  </div>
                  <div>
                    <Label>Publication Type</Label>
                    <Select value={pubType} onValueChange={(v) => setPubType(v as any)}>
                      <SelectTrigger className="glass-input mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="fast_track">Fast Track</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {pageCount != null && (
                    <p className="text-xs text-muted-foreground">Detected page count: {pageCount}</p>
                  )}
                </div>
              </GlassCard>

              <GlassCard>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" /> Co-Authors
                  </h2>
                  <Button type="button" variant="outline" size="sm" onClick={addCoAuthor}>
                    <Plus className="w-4 h-4 mr-1" /> Add Co-Author
                  </Button>
                </div>

                {coAuthors.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4 text-sm">
                    No co-authors. Click "Add Co-Author" to add, or skip — co-authors are optional.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {coAuthors.map((ca, idx) => (
                      <div key={ca.id} className="p-4 rounded-lg bg-[hsl(var(--glass-bg))] relative">
                        <Button variant="ghost" size="icon" className="absolute top-2 right-2"
                          onClick={() => removeCoAuthor(ca.id)}><X className="w-4 h-4" /></Button>
                        <p className="text-xs text-muted-foreground mb-3">Co-Author {idx + 1}</p>
                        <div className="grid sm:grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs">First Name *</Label>
                            <div className="relative mt-1">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input className="glass-input pl-9 h-9 text-sm" value={ca.firstName}
                                onChange={(e) => updateCoAuthor(ca.id, 'firstName', e.target.value)} />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Last Name *</Label>
                            <div className="relative mt-1">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input className="glass-input pl-9 h-9 text-sm" value={ca.lastName}
                                onChange={(e) => updateCoAuthor(ca.id, 'lastName', e.target.value)} />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Email *</Label>
                            <div className="relative mt-1">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input type="email" className="glass-input pl-9 h-9 text-sm" value={ca.email}
                                onChange={(e) => updateCoAuthor(ca.id, 'email', e.target.value)} />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Affiliation</Label>
                            <div className="relative mt-1">
                              <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input className="glass-input pl-9 h-9 text-sm" value={ca.affiliation}
                                onChange={(e) => updateCoAuthor(ca.id, 'affiliation', e.target.value)} />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">ORCID iD</Label>
                            <div className="relative mt-1">
                              <Input className="glass-input h-9 text-sm" value={ca.orcid || ''}
                                placeholder="0000-0002-1825-0097"
                                onChange={(e) => updateCoAuthor(ca.id, 'orcid', e.target.value)} />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          {ca.verificationSent ? (
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle className="w-3 h-3 text-green-500" /> Verification email sent
                            </Badge>
                          ) : ca.skipVerification ? (
                            <Badge variant="outline">Verification skipped</Badge>
                          ) : (
                            <>
                              <Button type="button" size="sm" variant="outline" onClick={() => sendCoAuthorVerification(ca)}>
                                <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Send Verification Email
                              </Button>
                              <Button type="button" size="sm" variant="ghost"
                                onClick={() => updateCoAuthor(ca.id, 'skipVerification', true)}>
                                Skip
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              <GlassCard>
                <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" /> Status Notification Email
                </h2>
                <Label>Send all article status updates to this email</Label>
                <Input
                  type="email"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                  placeholder="notify@example.com"
                  className="glass-input mt-1"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  This email will receive the submission confirmation immediately. The author's own email is also notified.
                </p>
              </GlassCard>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button onClick={handleSubmitArticle} disabled={submitting} className="gradient-primary">
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileUp className="w-4 h-4 mr-2" />}
                  Submit Article
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <GlassCard>
              <div className="text-center py-10">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="font-display text-2xl font-bold mb-2">Article submitted</h2>
                <p className="text-muted-foreground mb-1">Reference: <span className="font-mono">{submittedRef}</span></p>
                <p className="text-sm text-muted-foreground mb-6">
                  Confirmation emails have been dispatched{notificationEmail ? ` to ${notificationEmail} and the author` : ' to the author'}.
                </p>
                <Button onClick={resetWizard} className="gradient-primary">Submit Another</Button>
              </div>
            </GlassCard>
          )}
        </TabsContent>

        <TabsContent value="create">
          <GlassCard>
            <div className="space-y-4 max-w-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>First Name *</Label>
                  <Input value={cFirstName} onChange={(e) => setCFirstName(e.target.value)} placeholder="First name" className="glass-input mt-1" />
                </div>
                <div>
                  <Label>Last Name *</Label>
                  <Input value={cLastName} onChange={(e) => setCLastName(e.target.value)} placeholder="Last name" className="glass-input mt-1" />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} className="glass-input mt-1" />
                </div>
                <div>
                  <Label>Temporary Password (optional)</Label>
                  <Input type="text" value={cPassword} onChange={(e) => setCPassword(e.target.value)} className="glass-input mt-1" placeholder="Leave blank to auto-generate" />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input value={cCountry} onChange={(e) => setCCountry(e.target.value)} className="glass-input mt-1" />
                </div>
                <div className="md:col-span-2">
                  <Label>Affiliation</Label>
                  <Input value={cAffiliation} onChange={(e) => setCAffiliation(e.target.value)} className="glass-input mt-1" />
                </div>
                <div>
                  <Label>Billing Region</Label>
                  <Select value={cIsIndian} onValueChange={(v) => setCIsIndian(v as any)}>
                    <SelectTrigger className="glass-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (from country)</SelectItem>
                      <SelectItem value="yes">India (INR)</SelectItem>
                      <SelectItem value="no">International (USD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                If you leave the password blank, a one-time temporary password is generated, emailed to the author, and shown here. The author will be forced to set a new password and verify their email on first sign-in.
              </p>

              {generatedTemp && (
                <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-sm space-y-1">
                  <p className="font-semibold text-emerald-400">Temporary credentials (also emailed to the author)</p>
                  <p><span className="text-muted-foreground">Email:</span> <code className="font-mono">{generatedTemp.email}</code></p>
                  <p><span className="text-muted-foreground">Temp password:</span> <code className="font-mono text-primary">{generatedTemp.password}</code></p>
                </div>
              )}

              <Button onClick={handleCreateAuthor} disabled={creating} className="gradient-primary">
                {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                Create Author Account
              </Button>
            </div>
          </GlassCard>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
