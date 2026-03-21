import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Upload, FileText, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface SendGalleyProofDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: any;
}

export function SendGalleyProofDialog({ open, onOpenChange, article }: SendGalleyProofDialogProps) {
  const [wordFile, setWordFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  const authorProfile = article?.profiles as any;
  const isFirstPublication = article?.publication_type === 'fast_track';

  const handleSend = async () => {
    if (!wordFile || !pdfFile) {
      toast.error('Please upload both Word and PDF files');
      return;
    }

    setSending(true);
    try {
      const articleId = article.id;
      const wordPath = `galley-proofs/${articleId}/${crypto.randomUUID()}.docx`;
      const pdfPath = `galley-proofs/${articleId}/${crypto.randomUUID()}.pdf`;

      // Upload both files
      const [wordUpload, pdfUpload] = await Promise.all([
        supabase.storage.from('formatted-articles').upload(wordPath, wordFile),
        supabase.storage.from('formatted-articles').upload(pdfPath, pdfFile),
      ]);

      if (wordUpload.error) throw wordUpload.error;
      if (pdfUpload.error) throw pdfUpload.error;

      // Calculate deadline: 2 hours for fast_track, 2 days for normal
      const deadline = new Date();
      if (isFirstPublication) {
        deadline.setHours(deadline.getHours() + 2);
      } else {
        deadline.setDate(deadline.getDate() + 2);
      }

      // Update article with galley proof info
      const { error: updateError } = await supabase
        .from('articles')
        .update({
          galley_proof_word_url: wordPath,
          galley_proof_pdf_url: pdfPath,
          galley_proof_deadline: deadline.toISOString(),
          galley_proof_status: 'sent',
          galley_proof_sent_at: new Date().toISOString(),
          galley_proof_consent: false,
          galley_proof_revision_url: null,
        } as any)
        .eq('id', articleId);

      if (updateError) throw updateError;

      // Generate signed URLs for email
      const [wordUrlRes, pdfUrlRes] = await Promise.all([
        supabase.storage.from('formatted-articles').createSignedUrl(wordPath, 7 * 24 * 60 * 60),
        supabase.storage.from('formatted-articles').createSignedUrl(pdfPath, 7 * 24 * 60 * 60),
      ]);

      // Send email to author
      await supabase.functions.invoke('send-email', {
        body: {
          to: authorProfile?.email,
          template: 'galley-proof-review',
          data: {
            authorName: authorProfile?.full_name || article.author_name || 'Author',
            articleTitle: article.title,
            referenceNumber: article.reference_number,
            deadline: deadline.toLocaleString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            }),
            wordDownloadUrl: wordUrlRes.data?.signedUrl || '',
            pdfDownloadUrl: pdfUrlRes.data?.signedUrl || '',
            isFirstPublication,
          },
        },
      });

      // Send notification
      await supabase.from('notifications').insert({
        user_id: article.author_id,
        title: 'Galley Proof Ready for Review 📄',
        message: `Your galley proof for "${article.title}" is ready. Please review and respond by ${deadline.toLocaleDateString()}.`,
        type: 'info',
        link: '/author/articles',
      });

      toast.success('Galley proof sent to author!');
      queryClient.invalidateQueries({ queryKey: ['admin-article-detail'] });
      queryClient.invalidateQueries({ queryKey: ['admin-articles'] });
      onOpenChange(false);
      setWordFile(null);
      setPdfFile(null);
    } catch (err: any) {
      console.error('Failed to send galley proof:', err);
      toast.error('Failed to send galley proof: ' + (err.message || 'Unknown error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card-strong max-w-lg">
        <DialogHeader>
          <DialogTitle className="gradient-text">Send Galley Proof</DialogTitle>
          <DialogDescription>
            Upload Word and PDF files to send to the author for review.
            Deadline: {isFirstPublication ? '2 hours' : '2 days'} from now.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Article info */}
          <div className="p-3 rounded-lg bg-muted/30 text-sm space-y-1">
            <p><span className="text-muted-foreground">Article:</span> {article?.title}</p>
            <p><span className="text-muted-foreground">Author:</span> {authorProfile?.full_name || 'N/A'} ({authorProfile?.email || 'N/A'})</p>
            <p><span className="text-muted-foreground">Ref:</span> {article?.reference_number}</p>
          </div>

          {/* Word file */}
          <div className="space-y-2">
            <Label>Word Document (.docx)</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                wordFile ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
              onClick={() => document.getElementById('galley-word-input')?.click()}
            >
              {wordFile ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="truncate">{wordFile.name}</span>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">
                  <Upload className="w-5 h-5 mx-auto mb-1" />
                  Click to upload Word file
                </div>
              )}
              <input
                id="galley-word-input"
                type="file"
                accept=".docx,.doc"
                className="hidden"
                onChange={(e) => setWordFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          {/* PDF file */}
          <div className="space-y-2">
            <Label>PDF Document (.pdf)</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                pdfFile ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
              onClick={() => document.getElementById('galley-pdf-input')?.click()}
            >
              {pdfFile ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="truncate">{pdfFile.name}</span>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">
                  <Upload className="w-5 h-5 mx-auto mb-1" />
                  Click to upload PDF file
                </div>
              )}
              <input
                id="galley-pdf-input"
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          {/* Instructions preview */}
          <div className="p-3 rounded-lg bg-muted/20 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-sm">Email will include:</p>
            <p>• Corrections highlighted in <span className="text-red-400 font-semibold">RED</span> — author should review</p>
            <p>• Missing info highlighted in <span className="text-yellow-400 font-semibold">YELLOW</span> — author should fill in</p>
            <p>• Deadline: {isFirstPublication ? '2 hours' : '2 days'} to respond</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button
            className="gradient-primary"
            onClick={handleSend}
            disabled={sending || !wordFile || !pdfFile}
          >
            {sending ? <GlassSpinner size="sm" /> : <><Send className="w-4 h-4 mr-2" />Send Galley Proof</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
