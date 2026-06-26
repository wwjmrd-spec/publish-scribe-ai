import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Upload,
  CheckCircle,
  Clock,
  FileText,
  AlertTriangle,
  Edit3,
  X,
} from 'lucide-react';
import { ArticleContentEditor } from '@/components/admin/ArticleContentEditor';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { queryTimeout } from '@/lib/queryTimeout';

interface GalleyProofReviewSectionProps {
  article: any;
}

export function GalleyProofReviewSection({ article }: GalleyProofReviewSectionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editorContent, setEditorContent] = useState<string | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);

  const galleyStatus = (article as any).galley_proof_status;
  const deadline = (article as any).galley_proof_deadline;
  const isExpired = deadline ? new Date(deadline) < new Date() : false;

  if (!galleyStatus || galleyStatus === 'none') return null;

  const handleDownload = async (fileType: 'galley_proof_word' | 'galley_proof_pdf') => {
    try {
      const url = fileType === 'galley_proof_word'
        ? (article as any).galley_proof_word_url
        : (article as any).galley_proof_pdf_url;

      if (!url) {
        toast.error('File not available');
        return;
      }

      const { data, error } = await supabase.storage
        .from('formatted-articles')
        .createSignedUrl(url, 3600);

      if (error || !data?.signedUrl) {
        toast.error('Failed to get download link');
        return;
      }

      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      toast.error('Download failed');
    }
  };

  const handleUploadRevision = async () => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const filePath = `galley-proofs/${article.id}/revision-${crypto.randomUUID()}.docx`;
      const { error: uploadError } = await supabase.storage
        .from('formatted-articles')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('articles')
        .update({
          galley_proof_revision_url: filePath,
          galley_proof_status: 'revision_submitted',
        } as any)
        .eq('id', article.id);

      if (updateError) throw updateError;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();

      const { data: adminSettings } = await supabase
        .from('admin_settings')
        .select('setting_value')
        .eq('setting_key', 'admin_notification_email')
        .single();
      const adminEmail = adminSettings?.setting_value || 'shubhmeena23@gmail.com';

      const emailData = {
        articleTitle: article.title,
        referenceNumber: article.reference_number,
        authorName: article.author_name || profile?.full_name || 'Author',
        authorEmail: profile?.email || user.email,
        submissionDate: new Date().toLocaleDateString(),
      };

      supabase.functions.invoke('send-email', {
        body: { to: profile?.email || user.email, template: 'galley-proof-revision', data: emailData, isAdmin: false },
      }).catch((err) => console.error('Failed to send author galley proof revision email:', err));

      supabase.functions.invoke('send-email', {
        body: { to: adminEmail, template: 'galley-proof-revision', data: emailData, isAdmin: true },
      }).catch((err) => console.error('Failed to send admin galley proof revision email:', err));

      toast.success('Revised galley proof uploaded successfully!');
      queryClient.invalidateQueries({ queryKey: ['my-articles'] });
      setFile(null);
    } catch (err: any) {
      toast.error('Failed to upload revision: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const response = await supabase.functions.invoke('submit-galley-response', {
        body: { articleId: article.id, action: 'approve' },
      });
      if (response.error) throw new Error(response.error.message);
      if ((response.data as any)?.error) throw new Error((response.data as any).error);

      toast.success('Galley proof approved and sent for final processing!');
      queryClient.invalidateQueries({ queryKey: ['my-articles'] });
    } catch (err: any) {
      toast.error('Failed to approve: ' + (err.message || 'Unknown error'));
    } finally {
      setApproving(false);
    }
  };

  /** Use the admin-edited formatted content as the seed for the author editor.
   *  Falls back to a minimal rebuild from article fields when missing. */
  const buildEditorSeed = () => {
    const formatted = editorContent || (article as any).author_revision_html || (article as any).formatted_content;
    if (formatted) return formatted as string;
    let html = `<h1>${article.title || 'Untitled'}</h1>`;
    if (article.author_name) html += `<p><strong>${article.author_name}</strong></p>`;
    if (article.abstract) html += `<h2>Abstract</h2><p>${article.abstract}</p>`;
    if (article.keywords?.length > 0) html += `<p><strong>Keywords:</strong> ${article.keywords.join(', ')}</p>`;
    return html;
  };

  const openEditor = async () => {
    setShowEditor(true);
    if (editorContent || (article as any).author_revision_html || (article as any).formatted_content) return;

    setEditorLoading(true);
    try {
      const { data, error } = await supabase
        .from('articles')
        .select('formatted_content, author_revision_html, abstract, keywords')
        .eq('id', article.id)
        .abortSignal(queryTimeout())
        .maybeSingle();
      if (error) throw error;
      if ((data as any)?.abstract && !article.abstract) article.abstract = (data as any).abstract;
      if ((data as any)?.keywords && !article.keywords) article.keywords = (data as any).keywords;
      setEditorContent(((data as any)?.author_revision_html || (data as any)?.formatted_content || null) as string | null);
    } catch (err: any) {
      toast.error('Editor content could not be loaded. Opening basic article details instead.');
    } finally {
      setEditorLoading(false);
    }
  };

  return (
    <GlassCard className="border-primary/20">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-base">Galley Proof Review</h3>
          {galleyStatus === 'approved' && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              ✅ Approved
            </span>
          )}
          {galleyStatus === 'revision_submitted' && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
              📝 Revision Submitted
            </span>
          )}
          {galleyStatus === 'sent' && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              ⏳ Awaiting Your Response
            </span>
          )}
        </div>

        {(article as any).galley_proof_sent_at && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="w-4 h-4 text-primary" />
            <span>
              Galley Proof Sent: {new Date((article as any).galley_proof_sent_at).toLocaleString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        )}

        {deadline && (
          <div className={`flex items-center gap-2 text-sm ${isExpired ? 'text-red-400' : 'text-muted-foreground'}`}>
            {isExpired ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            <span>
              Deadline: {new Date(deadline).toLocaleString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
              {isExpired && ' (expired — you can still submit)'}
            </span>
          </div>
        )}

        {galleyStatus === 'sent' && (
          <div className="p-3 rounded-lg bg-muted/30 text-sm space-y-1">
            <p className="font-medium mb-2">How to respond:</p>
            <p>• Open the article in the editor and use the <span className="text-red-400 font-semibold">RED text colour</span> to highlight every change you need</p>
            <p>• When done, click <em>Send Corrections to Admin</em></p>
            <p>• Or, if everything looks perfect, click <em>Approve Galley Proof</em> below</p>
            <p>• Alternative: upload a revised Word file</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <DownloadButton size="sm" onDownload={() => handleDownload('galley_proof_pdf')}>
            PDF File
          </DownloadButton>
          {(article as any).galley_proof_word_url && (
            <DownloadButton size="sm" onDownload={() => handleDownload('galley_proof_word')}>
              Word (legacy)
            </DownloadButton>
          )}
          {(galleyStatus === 'sent' || galleyStatus === 'revision_submitted') && (
            <Button variant="outline" size="sm" onClick={openEditor} className="text-primary">
              <Edit3 className="w-4 h-4 mr-1" />
              {galleyStatus === 'revision_submitted' ? 'Re-open Editor' : 'Open Article Editor'}
            </Button>
          )}
        </div>

        {galleyStatus === 'sent' && (
          <>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Or upload revised galley proof (Word):</p>
              <div
                className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
                  file ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
                onClick={() => document.getElementById('galley-revision-input')?.click()}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="truncate">{file.name}</span>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    <Upload className="w-4 h-4 mx-auto mb-1" />
                    Click to upload revised file
                  </div>
                )}
                <input
                  id="galley-revision-input"
                  type="file"
                  accept=".docx,.doc"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
              {file && (
                <Button size="sm" onClick={handleUploadRevision} disabled={uploading} className="w-full">
                  {uploading ? <GlassSpinner size="sm" /> : <><Upload className="w-4 h-4 mr-1" />Submit Revision</>}
                </Button>
              )}
            </div>

            <div className="relative flex items-center gap-3">
              <div className="flex-1 border-t border-border/50" />
              <span className="text-xs text-muted-foreground">OR</span>
              <div className="flex-1 border-t border-border/50" />
            </div>

            <Button className="w-full gradient-primary" onClick={handleApprove} disabled={approving}>
              {approving ? <GlassSpinner size="sm" /> : <><CheckCircle className="w-4 h-4 mr-2" />Approve Galley Proof</>}
            </Button>
          </>
        )}
      </div>

      {/* Full-screen author editor */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-[98vw] w-[98vw] max-h-[97vh] p-0 overflow-auto">
          <div className="flex items-center justify-between p-3 border-b border-border sticky top-0 bg-background z-10">
            <div>
              <h3 className="font-semibold">Author Editor — {article.reference_number}</h3>
              <p className="text-xs text-muted-foreground">Highlight your changes in red and click Send Corrections to Admin</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowEditor(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="p-3">
            {editorLoading ? (
              <div className="flex items-center justify-center h-64">
                <GlassSpinner size="lg" />
              </div>
            ) : (
              <ArticleContentEditor
                articleId={article.id}
                initialContent={buildEditorSeed()}
                articleTitle={article.title}
                referenceNumber={article.reference_number}
                onClose={() => setShowEditor(false)}
                mode="author"
                articleMeta={{
                  authorName: article.author_name || undefined,
                  authorEmail: user?.email || undefined,
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </GlassCard>
  );
}
