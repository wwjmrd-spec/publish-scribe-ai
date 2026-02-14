import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { GlassCard } from '@/components/layout/GlassCard';
import { useToast } from '@/hooks/use-toast';
import { useGenerateSubject } from '@/hooks/useGenerateSubject';
import { supabase } from '@/integrations/supabase/client';
import { ArticleDetailsSection } from '@/components/submit/ArticleDetailsSection';
import { FileUploadSection } from '@/components/submit/FileUploadSection';
import { CoAuthorsSection, type CoAuthor } from '@/components/submit/CoAuthorsSection';
import { ArrowRight, ArrowLeft, Upload, FileText, CheckCircle, User } from 'lucide-react';

type Step = 1 | 2 | 3;

const stepInfo = [
  { label: 'Upload', icon: Upload },
  { label: 'Details', icon: FileText },
  { label: 'Done', icon: CheckCircle },
];

export default function SubmitArticle() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { generateSubject, loading: generatingSubject } = useGenerateSubject();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [submittedRef, setSubmittedRef] = useState('');
  const [title, setTitle] = useState('');
  const [abstract, setAbstract] = useState('');
  const [keywords, setKeywords] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [coAuthors, setCoAuthors] = useState<CoAuthor[]>([]);

  const [authorName, setAuthorName] = useState('');
  const [country, setCountry] = useState('');
  const [subject, setSubject] = useState('');
  const [reasonOfResearch, setReasonOfResearch] = useState('');
  const [submissionTarget, setSubmissionTarget] = useState('');

  // Pre-fill from profile
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

  // Scan file to extract details (Step 1 → Step 2 transition)
  const handleFileNext = async () => {
    if (!file) {
      toast({ title: 'Please upload a document', variant: 'destructive' });
      return;
    }
    // Move to step 2 - details are editable by author
    setStep(2);
  };

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

  const handleSubmit = async () => {
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
            to: 'shubhmeena23@gmail.com',
            template: 'article-submission',
            data: emailData,
            isAdmin: true,
          },
        })
        .catch((err) => console.error('Failed to send admin email:', err));

      setSubmittedRef(article.reference_number);
      setStep(3);
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
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">Submit Article</h1>
          <p className="text-muted-foreground">
            Follow the steps below to submit your article for review
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {stepInfo.map((s, i) => {
            const stepNum = (i + 1) as Step;
            const isActive = step === stepNum;
            const isDone = step > stepNum;
            const Icon = s.icon;
            return (
              <React.Fragment key={i}>
                {i > 0 && (
                  <div
                    className={`h-0.5 w-12 sm:w-20 transition-colors ${
                      isDone ? 'bg-primary' : 'bg-[hsl(var(--glass-border))]'
                    }`}
                  />
                )}
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? 'gradient-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.4)]'
                        : isDone
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-[hsl(var(--glass-bg-strong))] text-muted-foreground'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      isActive ? 'text-primary' : isDone ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
            >
              <FileUploadSection file={file} setFile={setFile} />
              <div className="flex justify-end mt-6">
                <Button
                  onClick={handleFileNext}
                  disabled={!file}
                  className="gradient-primary hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)] min-w-[150px]"
                >
                  Next: Article Details
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="space-y-6"
            >
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

              <CoAuthorsSection
                coAuthors={coAuthors}
                onAdd={addCoAuthor}
                onRemove={removeCoAuthor}
                onUpdate={updateCoAuthor}
              />

              <div className="flex justify-between gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  disabled={loading}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
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
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <GlassCard className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-green-500" />
                </div>
                <h2 className="font-display text-2xl font-bold mb-2">
                  Article Submitted Successfully! 🎉
                </h2>
                <p className="text-muted-foreground mb-2">
                  Your article has been submitted and is now under review.
                </p>
                <p className="text-sm font-mono text-primary mb-8">
                  Reference: {submittedRef}
                </p>
                <div className="flex justify-center gap-4">
                  <Button variant="outline" onClick={() => navigate('/author/articles')}>
                    View My Articles
                  </Button>
                  <Button
                    className="gradient-primary"
                    onClick={() => {
                      setStep(1);
                      setFile(null);
                      setTitle('');
                      setAbstract('');
                      setKeywords('');
                      setCoAuthors([]);
                      setSubject('');
                      setReasonOfResearch('');
                      setSubmissionTarget('');
                      setSubmittedRef('');
                    }}
                  >
                    Submit Another
                  </Button>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </DashboardLayout>
  );
}
