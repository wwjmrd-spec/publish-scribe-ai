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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UserPlus, FileUp, Loader2 } from 'lucide-react';

export default function AdminSubmitForAuthor() {
  const queryClient = useQueryClient();

  // --- Create Author state ---
  const [cEmail, setCEmail] = useState('');
  const [cPassword, setCPassword] = useState('');
  const [cFullName, setCFullName] = useState('');
  const [cCountry, setCCountry] = useState('');
  const [cAffiliation, setCAffiliation] = useState('');
  const [cIsIndian, setCIsIndian] = useState<'auto' | 'yes' | 'no'>('auto');
  const [creating, setCreating] = useState(false);

  // --- Submit Article state ---
  const [authorId, setAuthorId] = useState('');
  const [authorSearch, setAuthorSearch] = useState('');
  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [keywords, setKeywords] = useState('');
  const [subject, setSubject] = useState('');
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState('');
  const [pubType, setPubType] = useState<'normal' | 'fast_track'>('normal');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const handleCreateAuthor = async () => {
    if (!cEmail || !cPassword || !cFullName) {
      toast.error('Email, password, and full name are required');
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-author', {
        body: {
          email: cEmail.trim(),
          password: cPassword,
          full_name: cFullName.trim(),
          country: cCountry.trim() || 'Unknown',
          affiliation: cAffiliation.trim(),
          is_indian: cIsIndian === 'auto' ? undefined : cIsIndian === 'yes',
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Author account created');
      setCEmail(''); setCPassword(''); setCFullName(''); setCCountry(''); setCAffiliation(''); setCIsIndian('auto');
      queryClient.invalidateQueries({ queryKey: ['admin-all-authors-min'] });
      queryClient.invalidateQueries({ queryKey: ['admin-authors'] });
    } catch (e: any) {
      toast.error('Failed to create author: ' + (e?.message || e));
    } finally {
      setCreating(false);
    }
  };

  const handleSubmitArticle = async () => {
    if (!authorId) { toast.error('Select an author'); return; }
    if (!title.trim() || title.trim().length < 3) { toast.error('Enter a title'); return; }
    if (!file) { toast.error('Attach the manuscript file (.docx or .pdf)'); return; }
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
      if (!res.ok || data?.error) throw new Error(typeof data?.error === 'string' ? data.error : 'Submission failed');

      toast.success(`Article submitted (${data.reference_number})`);
      setTitle(''); setAbstract(''); setKeywords(''); setSubject(''); setReason(''); setTarget(''); setFile(null); setAuthorId('');
    } catch (e: any) {
      toast.error('Failed: ' + (e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout type="admin">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2">Author & Submission Tools</h1>
        <p className="text-muted-foreground">Create author accounts and submit articles on their behalf.</p>
      </motion.div>

      <Tabs defaultValue="submit" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="submit"><FileUp className="w-4 h-4 mr-2" /> Submit Article</TabsTrigger>
          <TabsTrigger value="create"><UserPlus className="w-4 h-4 mr-2" /> Create Author</TabsTrigger>
        </TabsList>

        <TabsContent value="submit">
          <GlassCard>
            <div className="space-y-5">
              <div>
                <Label>Select Author</Label>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Keywords (comma separated)</Label>
                  <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} className="glass-input mt-1" />
                </div>
                <div>
                  <Label>Submission Target</Label>
                  <Input value={target} onChange={(e) => setTarget(e.target.value)} className="glass-input mt-1" />
                </div>
              </div>

              <div>
                <Label>Reason of Research</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="glass-input mt-1" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div>
                  <Label>Manuscript File (.docx or .pdf) *</Label>
                  <Input
                    type="file"
                    accept=".docx,.pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="glass-input mt-1"
                  />
                </div>
              </div>

              <Button onClick={handleSubmitArticle} disabled={submitting} className="gradient-primary">
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileUp className="w-4 h-4 mr-2" />}
                Submit Article
              </Button>
            </div>
          </GlassCard>
        </TabsContent>

        <TabsContent value="create">
          <GlassCard>
            <div className="space-y-4 max-w-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Full Name *</Label>
                  <Input value={cFullName} onChange={(e) => setCFullName(e.target.value)} className="glass-input mt-1" />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} className="glass-input mt-1" />
                </div>
                <div>
                  <Label>Temporary Password *</Label>
                  <Input type="text" value={cPassword} onChange={(e) => setCPassword(e.target.value)} className="glass-input mt-1" placeholder="Min 8 chars" />
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
                The account is created with the email pre-confirmed. Share the temporary password with the author so they can sign in and change it.
              </p>

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
