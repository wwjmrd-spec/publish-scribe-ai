import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Upload,
  CheckCircle,
  Clock,
  FileText,
  AlertTriangle,
  Edit3,
} from 'lucide-react';
import { RichTextEditor } from '@/components/ui/RichTextEditor';

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
  const [editorContent, setEditorContent] = useState('');

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

      // Notify admins
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (admins) {
        const notifications = admins.map((a) => ({
          user_id: a.user_id,
          title: 'Galley Proof Revision Submitted 📝',
          message: `Author has submitted a revised galley proof for "${article.title}" (${article.reference_number}).`,
          type: 'info',
          link: `/admin/articles/${article.id}`,
        }));
        await supabase.from('notifications').insert(notifications);
      }

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
      const { error } = await supabase
        .from('articles')
        .update({
          galley_proof_consent: true,
          galley_proof_status: 'approved',
        } as any)
        .eq('id', article.id);

      if (error) throw error;

      // Notify admins
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (admins) {
        const notifications = admins.map((a) => ({
          user_id: a.user_id,
          title: 'Galley Proof Approved ✅',
          message: `Author has approved the galley proof for "${article.title}" (${article.reference_number}).`,
          type: 'success',
          link: `/admin/articles/${article.id}`,
        }));
        await supabase.from('notifications').insert(notifications);
      }

      toast.success('Galley proof approved!');
      queryClient.invalidateQueries({ queryKey: ['my-articles'] });
    } catch (err: any) {
      toast.error('Failed to approve: ' + (err.message || 'Unknown error'));
    } finally {
      setApproving(false);
    }
  };

  const handleOpenEditor = () => {
    // Use formatted_content from the article if available (admin-edited content)
    const formattedContent = (article as any).formatted_content;
    if (formattedContent) {
      setEditorContent(formattedContent);
    } else {
      // Fallback: build from article data
      let html = `<h1>${article.title || 'Untitled'}</h1>`;
      if (article.author_name) {
        html += `<p><strong>${article.author_name}</strong></p>`;
      }
      if (article.abstract) {
        html += `<h2>Abstract</h2><p>${article.abstract}</p>`;
      }
      if (article.keywords?.length > 0) {
        html += `<p><strong>Keywords:</strong> ${article.keywords.join(', ')}</p>`;
      }
      setEditorContent(html);
    }
    setShowEditor(true);
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

        {/* Sent date */}
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

        {/* Deadline */}
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

        {/* Instructions */}
        {galleyStatus === 'sent' && (
          <div className="p-3 rounded-lg bg-muted/30 text-sm space-y-1">
            <p className="font-medium mb-2">Instructions:</p>
            <p>• Review the galley proof files carefully</p>
            <p>• Corrections are highlighted in <span className="text-red-400 font-semibold">RED</span> — please review</p>
            <p>• Missing information is highlighted in <span className="text-yellow-400 font-semibold">YELLOW</span> — please fill in the correct details</p>
            <p>• If corrections needed: upload the revised Word file below or use the editor</p>
            <p>• If everything looks good: click "Approve Galley Proof"</p>
          </div>
        )}

        {/* Download buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownload('galley_proof_word')}
          >
            <Download className="w-4 h-4 mr-1" />
            Word File
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownload('galley_proof_pdf')}
          >
            <Download className="w-4 h-4 mr-1" />
            PDF File
          </Button>
          {galleyStatus === 'sent' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenEditor}
              className="text-primary"
            >
              <Edit3 className="w-4 h-4 mr-1" />
              Edit Article
            </Button>
          )}
        </div>

        {/* Rich Text Editor */}
        {showEditor && galleyStatus === 'sent' && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Edit Article Content:</p>
            <RichTextEditor
              content={editorContent}
              onChange={setEditorContent}
              className="min-h-[250px]"
            />
            <p className="text-xs text-muted-foreground">
              Edit your article content here. Changes will be visible for your reference. Upload the final revised Word file below to submit.
            </p>
          </div>
        )}

        {/* Actions (only if not yet responded) */}
        {galleyStatus === 'sent' && (
          <>
            {/* Upload revision */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Upload revised galley proof (Word):</p>
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
                <Button
                  size="sm"
                  onClick={handleUploadRevision}
                  disabled={uploading}
                  className="w-full"
                >
                  {uploading ? <GlassSpinner size="sm" /> : <><Upload className="w-4 h-4 mr-1" />Submit Revision</>}
                </Button>
              )}
            </div>

            {/* Or approve */}
            <div className="relative flex items-center gap-3">
              <div className="flex-1 border-t border-border/50" />
              <span className="text-xs text-muted-foreground">OR</span>
              <div className="flex-1 border-t border-border/50" />
            </div>

            <Button
              className="w-full gradient-primary"
              onClick={handleApprove}
              disabled={approving}
            >
              {approving ? <GlassSpinner size="sm" /> : <><CheckCircle className="w-4 h-4 mr-2" />Approve Galley Proof</>}
            </Button>
          </>
        )}
      </div>
    </GlassCard>
  );
}
