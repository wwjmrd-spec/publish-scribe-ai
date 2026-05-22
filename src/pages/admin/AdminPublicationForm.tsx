import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { toast } from 'sonner';
import { ArrowLeft, Save, Copy, Download, FileText } from 'lucide-react';

type FormState = {
  article_title: string;
  correspondence_author_name: string;
  co_authors_names: string;
  country: string;
  subject: string;
  description: string;
  keywords: string;
  publication_year_month: string;
  doi: string;
  abstract: string;
  final_pdf_url: string;
};

const EMPTY: FormState = {
  article_title: '',
  correspondence_author_name: '',
  co_authors_names: '',
  country: '',
  subject: '',
  description: '',
  keywords: '',
  publication_year_month: '',
  doi: '',
  abstract: '',
  final_pdf_url: '',
};

export default function AdminPublicationForm() {
  const { articleId } = useParams<{ articleId: string }>();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  const { data: article, isLoading } = useQuery({
    queryKey: ['publication-form-article', articleId],
    enabled: !!articleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('articles')
        .select('*, profiles:author_id (full_name, email, country, affiliation), co_authors(name,email,affiliation)')
        .eq('id', articleId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: existing } = useQuery({
    queryKey: ['publication-form-data', articleId],
    enabled: !!articleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('publication_form_data' as any)
        .select('*')
        .eq('article_id', articleId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (hydrated || !article) return;
    const profile = (article as any).profiles || {};
    const coAuthors = ((article as any).co_authors || [])
      .map((c: any) => c.name)
      .filter(Boolean)
      .join(', ');
    setForm({
      article_title: existing?.article_title ?? (article as any).title ?? '',
      correspondence_author_name: existing?.correspondence_author_name ?? ((article as any).author_name || profile.full_name || ''),
      co_authors_names: existing?.co_authors_names ?? coAuthors,
      country: existing?.country ?? ((article as any).country || profile.country || ''),
      subject: existing?.subject ?? ((article as any).subject || ''),
      description: existing?.description ?? ((article as any).reason_of_research || ''),
      keywords: existing?.keywords ?? (((article as any).keywords || []).join(', ')),
      publication_year_month: existing?.publication_year_month ?? ((article as any).publication_year || ''),
      doi: existing?.doi ?? '',
      abstract: existing?.abstract ?? ((article as any).abstract || ''),
      final_pdf_url: existing?.final_pdf_url ?? ((article as any).galley_proof_pdf_url || (article as any).formatted_document_url || ''),
    });
    setHydrated(true);
  }, [article, existing, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        article_id: articleId,
        created_by: auth.user?.id,
        ...form,
      };
      const { error } = await supabase
        .from('publication_form_data' as any)
        .upsert(payload, { onConflict: 'article_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Publication form saved');
      qc.invalidateQueries({ queryKey: ['publication-form-data', articleId] });
    },
    onError: (e: any) => toast.error('Save failed: ' + e.message),
  });

  const handleCopyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(form, null, 2));
    toast.success('Copied JSON to clipboard');
  };

  const handleCopyField = async (key: keyof FormState, label: string) => {
    await navigator.clipboard.writeText(form[key] || '');
    toast.success(`Copied ${label}`);
  };

  const handleDownloadPdf = async () => {
    const path = form.final_pdf_url;
    if (!path) {
      toast.error('No final PDF set yet. Paste a path or upload via Galley Proofs.');
      return;
    }
    const { data, error } = await supabase.storage
      .from('formatted-articles')
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast.error('Could not generate download link');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  if (isLoading) {
    return (
      <DashboardLayout type="admin">
        <div className="flex justify-center py-20"><GlassSpinner size="lg" /></div>
      </DashboardLayout>
    );
  }

  const fields: Array<{ key: keyof FormState; label: string; long?: boolean }> = [
    { key: 'article_title', label: 'Article Title' },
    { key: 'correspondence_author_name', label: 'Correspondence Author Name' },
    { key: 'co_authors_names', label: 'Co-Authors Names' },
    { key: 'country', label: 'Country' },
    { key: 'subject', label: 'Subject' },
    { key: 'description', label: 'Description', long: true },
    { key: 'keywords', label: 'Keywords' },
    { key: 'publication_year_month', label: 'Year & Month' },
    { key: 'doi', label: 'DOI' },
    { key: 'abstract', label: 'Abstract', long: true },
  ];

  return (
    <DashboardLayout type="admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/publish-queue"><ArrowLeft className="w-4 h-4 mr-1" /> Back to Queue</Link>
            </Button>
            <div>
              <h1 className="text-3xl font-display font-bold gradient-text">Publication Form</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {(article as any)?.reference_number} — fill in details for the WWJMRD publication form.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handleCopyJson}>
              <Copy className="w-4 h-4 mr-1" /> Copy All as JSON
            </Button>
            <Button variant="outline" onClick={handleDownloadPdf}>
              <Download className="w-4 h-4 mr-1" /> Download Final PDF
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <GlassSpinner size="sm" /> : <><Save className="w-4 h-4 mr-1" /> Save</>}
            </Button>
          </div>
        </div>

        <GlassCard className="p-6 space-y-5">
          {fields.map(({ key, label, long }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={key}>{label}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleCopyField(key, label)}
                >
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
              </div>
              {long ? (
                <Textarea
                  id={key}
                  value={form[key]}
                  rows={key === 'abstract' ? 8 : 3}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="glass-input"
                />
              ) : (
                <Input
                  id={key}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="glass-input"
                />
              )}
            </div>
          ))}

          <div className="space-y-2 pt-2 border-t border-border/50">
            <Label htmlFor="final_pdf_url" className="flex items-center gap-2">
              <FileText className="w-4 h-4" /> Final Ready-to-Publish PDF (storage path)
            </Label>
            <Input
              id="final_pdf_url"
              value={form.final_pdf_url}
              onChange={(e) => setForm({ ...form, final_pdf_url: e.target.value })}
              placeholder="galley-proofs/<article>/<file>.pdf"
              className="glass-input"
            />
            <p className="text-xs text-muted-foreground">
              Defaults to the galley proof PDF. Replace with the final corrected file path if different.
            </p>
          </div>
        </GlassCard>
      </div>
    </DashboardLayout>
  );
}
