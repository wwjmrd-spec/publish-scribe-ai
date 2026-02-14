import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GlassCard } from '@/components/layout/GlassCard';
import { Button } from '@/components/ui/button';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { FileUploadSection } from '@/components/submit/FileUploadSection';
import { ArrowRight, ArrowLeft, FileText } from 'lucide-react';

export default function ResubmitArticle() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const article = (location.state as any)?.resubmit;
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  if (!article) {
    return (
      <DashboardLayout type="author">
        <div className="text-center py-16">
          <p className="text-muted-foreground">No article selected for resubmission.</p>
          <Button onClick={() => navigate('/author/articles')} className="mt-4">
            Go to My Articles
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      toast({ title: 'Please upload a revised document', variant: 'destructive' });
      return;
    }
    if (!user?.id) {
      toast({ title: 'You must be logged in', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      // Upload revised file
      const filePath = `${user.id}/${crypto.randomUUID()}.docx`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      // Update the existing article with new file and reset status
      const { error: updateError } = await supabase
        .from('articles')
        .update({
          document_url: filePath,
          status: 'submitted' as any,
        })
        .eq('id', article.id);

      if (updateError) throw updateError;

      // Get author profile for emails
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();

      // Send email notifications (fire & forget)
      const emailData = {
        articleTitle: article.title,
        referenceNumber: article.reference_number,
        authorName: article.author_name || profile?.full_name || 'Author',
        authorEmail: profile?.email || user.email,
        submissionDate: new Date().toLocaleDateString(),
      };

      supabase.functions
        .invoke('send-email', {
          body: {
            to: profile?.email || user.email,
            template: 'article-resubmission',
            data: emailData,
            isAdmin: false,
          },
        })
        .catch((err) => console.error('Failed to send author resubmit email:', err));

      supabase.functions
        .invoke('send-email', {
          body: {
            to: 'shubhmeena23@gmail.com',
            template: 'article-resubmission',
            data: emailData,
            isAdmin: true,
          },
        })
        .catch((err) => console.error('Failed to send admin resubmit email:', err));

      toast({
        title: 'Article resubmitted successfully!',
        description: `Reference: ${article.reference_number}`,
      });

      navigate('/author/articles');
    } catch (error: any) {
      console.error('Resubmission error:', error);
      toast({
        title: 'Resubmission failed',
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
          <h1 className="font-display text-3xl font-bold mb-2">Resubmit Article</h1>
          <p className="text-muted-foreground">
            Upload a revised version of your rejected article
          </p>
        </div>

        {/* Article Info */}
        <GlassCard className="mb-6">
          <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Original Article Details
          </h2>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Reference:</span>{' '}
              <span className="font-medium">{article.reference_number}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Author:</span>{' '}
              <span className="font-medium">{article.author_name}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-muted-foreground">Title:</span>{' '}
              <span className="font-medium">{article.title}</span>
            </div>
            {article.subject && (
              <div>
                <span className="text-muted-foreground">Subject:</span>{' '}
                <span className="font-medium">{article.subject}</span>
              </div>
            )}
          </div>
        </GlassCard>

        <form onSubmit={handleSubmit} className="space-y-6">
          <FileUploadSection file={file} setFile={setFile} />

          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/author/articles')}
              disabled={loading}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !file}
              className="gradient-primary hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)] min-w-[150px]"
            >
              {loading ? (
                <GlassSpinner size="sm" />
              ) : (
                <>
                  Resubmit Article
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
