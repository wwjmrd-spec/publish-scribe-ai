import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useToast } from '@/hooks/use-toast';
import { useGenerateSubject } from '@/hooks/useGenerateSubject';
import { supabase } from '@/integrations/supabase/client';
import { ArticleDetailsSection } from '@/components/submit/ArticleDetailsSection';
import { FileUploadSection } from '@/components/submit/FileUploadSection';
import { CoAuthorsSection, type CoAuthor } from '@/components/submit/CoAuthorsSection';
import { ArrowRight } from 'lucide-react';

export default function SubmitArticle() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { generateSubject, loading: generatingSubject } = useGenerateSubject();

  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [keywords, setKeywords] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [coAuthors, setCoAuthors] = useState<CoAuthor[]>([]);

  // New fields
  const [authorName, setAuthorName] = useState('');
  const [country, setCountry] = useState('');
  const [subject, setSubject] = useState('');
  const [reasonOfResearch, setReasonOfResearch] = useState('');
  const [submissionTarget, setSubmissionTarget] = useState('');

  // Pre-fill author name and country from profile
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('profiles')
      .select('full_name, country')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          if (data.full_name) setAuthorName(data.full_name);
          if (data.country) setCountry(data.country);
        }
      });
  }, [user?.id]);

  const handleGenerateSubject = async () => {
    const result = await generateSubject(abstract);
    if (result) setSubject(result);
  };

  const addCoAuthor = () => {
    setCoAuthors((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: '', email: '', affiliation: '' },
    ]);
  };

  const removeCoAuthor = (id: string) => {
    setCoAuthors((prev) => prev.filter((ca) => ca.id !== id));
  };

  const updateCoAuthor = (id: string, field: keyof CoAuthor, value: string) => {
    setCoAuthors((prev) =>
      prev.map((ca) => (ca.id === id ? { ...ca, [field]: value } : ca))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({ title: 'Please enter a title', variant: 'destructive' });
      return;
    }
    if (!authorName.trim()) {
      toast({ title: 'Please enter author name', variant: 'destructive' });
      return;
    }
    if (!file) {
      toast({ title: 'Please upload a document', variant: 'destructive' });
      return;
    }
    if (!user?.id) {
      toast({ title: 'You must be logged in', variant: 'destructive' });
      return;
    }

    // Validate co-author emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const filledCoAuthors = coAuthors.filter(
      (ca) => ca.name.trim() || ca.email.trim()
    );

    for (const ca of filledCoAuthors) {
      if (!ca.name.trim()) {
        toast({ title: 'Co-author name is required', variant: 'destructive' });
        return;
      }
      if (!ca.email.trim()) {
        toast({ title: 'Co-author email is required', variant: 'destructive' });
        return;
      }
      if (!emailRegex.test(ca.email.trim())) {
        toast({
          title: 'Invalid co-author email',
          description: `"${ca.email}" is not a valid email address`,
          variant: 'destructive',
        });
        return;
      }
      if (ca.email.trim().length > 254) {
        toast({ title: 'Co-author email too long', variant: 'destructive' });
        return;
      }
      if (ca.name.trim().length > 200) {
        toast({ title: 'Co-author name too long', variant: 'destructive' });
        return;
      }
    }

    setLoading(true);

    try {
      // Upload file
      const filePath = `${user.id}/${crypto.randomUUID()}.docx`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      // Get author profile for email
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();

      const keywordArray = keywords
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      const { data: article, error: articleError } = await supabase
        .from('articles')
        .insert({
          author_id: user.id,
          title: title.trim(),
          abstract: abstract.trim(),
          keywords: keywordArray,
          document_url: filePath,
          reference_number: '',
          author_name: authorName.trim(),
          country: country.trim() || null,
          subject: subject.trim() || null,
          reason_of_research: reasonOfResearch.trim() || null,
          submission_target: submissionTarget.trim() || null,
        })
        .select()
        .single();

      if (articleError) throw articleError;

      // Add co-authors
      const validCoAuthors = filledCoAuthors.filter(
        (ca) => ca.name.trim() && ca.email.trim() && emailRegex.test(ca.email.trim())
      );

      if (validCoAuthors.length > 0) {
        const { error: coAuthorError } = await supabase
          .from('co_authors')
          .insert(
            validCoAuthors.map((ca) => ({
              article_id: article.id,
              name: ca.name.trim(),
              email: ca.email.trim(),
              affiliation: ca.affiliation.trim() || null,
            }))
          );
        if (coAuthorError) throw coAuthorError;
      }

      // Send email notifications (fire & forget)
      const emailData = {
        articleTitle: title.trim(),
        referenceNumber: article.reference_number,
        authorName: authorName.trim() || profile?.full_name || user.email?.split('@')[0] || 'Author',
        authorEmail: profile?.email || user.email,
        submissionDate: new Date().toLocaleDateString(),
        coAuthors: validCoAuthors.map((ca) => ca.name),
      };

      supabase.functions
        .invoke('send-email', {
          body: {
            to: profile?.email || user.email,
            template: 'article-submission',
            data: emailData,
            isAdmin: false,
          },
        })
        .catch((err) => console.error('Failed to send author email:', err));

      supabase.functions
        .invoke('send-email', {
          body: {
            to: 'info@wwjmrd.com',
            template: 'article-submission',
            data: emailData,
            isAdmin: true,
          },
        })
        .catch((err) => console.error('Failed to send admin email:', err));

      toast({
        title: 'Article submitted successfully!',
        description: `Reference: ${article.reference_number}`,
      });

      navigate('/author/articles');
    } catch (error: any) {
      console.error('Submission error:', error);
      toast({
        title: 'Submission failed',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout type="author">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto"
      >
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">Submit Article</h1>
          <p className="text-muted-foreground">
            Fill in the details below to submit your article for review
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <ArticleDetailsSection
            title={title}
            setTitle={setTitle}
            abstract={abstract}
            setAbstract={setAbstract}
            keywords={keywords}
            setKeywords={setKeywords}
            authorName={authorName}
            setAuthorName={setAuthorName}
            country={country}
            setCountry={setCountry}
            subject={subject}
            setSubject={setSubject}
            reasonOfResearch={reasonOfResearch}
            setReasonOfResearch={setReasonOfResearch}
            submissionTarget={submissionTarget}
            setSubmissionTarget={setSubmissionTarget}
            onGenerateSubject={handleGenerateSubject}
            generatingSubject={generatingSubject}
          />

          <FileUploadSection file={file} setFile={setFile} />

          <CoAuthorsSection
            coAuthors={coAuthors}
            onAdd={addCoAuthor}
            onRemove={removeCoAuthor}
            onUpdate={updateCoAuthor}
          />

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/author')}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="gradient-primary hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)] min-w-[150px]"
            >
              {loading ? (
                <GlassSpinner size="sm" />
              ) : (
                <>
                  Submit Article
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </form>
      </motion.div>
    </DashboardLayout>
  );
}
