import React, { useState, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Upload, FileText, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SendGalleyProofDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: any;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function SendGalleyProofDialog({ open, onOpenChange, article }: SendGalleyProofDialogProps) {
  const [wordFile, setWordFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState('files');
  const queryClient = useQueryClient();

  // Publication metadata
  const now = new Date();
  const [pubYear, setPubYear] = useState(now.getFullYear().toString());
  const [pubMonth, setPubMonth] = useState(MONTH_NAMES[now.getMonth()]);
  const [pubVolume, setPubVolume] = useState(article?.volume || '12');
  const [pubIssue, setPubIssue] = useState(article?.issue || '01');
  const [pubPageRange, setPubPageRange] = useState(article?.page_number || '1-4');

  // Rich text editor content
  const [editorContent, setEditorContent] = useState('');
  const [editorLoaded, setEditorLoaded] = useState(false);

  const authorProfile = article?.profiles as any;
  const isFirstPublication = article?.publication_type === 'fast_track';

  // Load article content for editing when dialog opens
  useEffect(() => {
    if (open && article && !editorLoaded) {
      const content = buildEditorContent(article);
      setEditorContent(content);
      setEditorLoaded(true);
    }
    if (!open) {
      setEditorLoaded(false);
    }
  }, [open, article]);

  function buildEditorContent(article: any) {
    let html = '';
    html += `<h1>${article.title || 'Untitled'}</h1>`;
    if (article.author_name || authorProfile?.full_name) {
      html += `<p><strong>${article.author_name || authorProfile?.full_name}</strong></p>`;
    }
    if (article.abstract) {
      html += `<h2>Abstract</h2><p>${article.abstract}</p>`;
    }
    if (article.keywords?.length > 0) {
      html += `<p><strong>Keywords:</strong> ${article.keywords.join(', ')}</p>`;
    }
    return html;
  }

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

      // Update article with galley proof info and publication metadata
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
          volume: pubVolume,
          issue: pubIssue,
          page_number: pubPageRange,
          publication_year: `${pubMonth}-${pubYear}`,
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
            publicationInfo: `${pubYear}; ${pubVolume}(${pubIssue}): ${pubPageRange}`,
            publicationMonth: `(${pubMonth}-${pubYear})`,
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

  const citationPreview = `WWJMRD ${pubYear}; ${pubVolume}(${pubIssue}): ${pubPageRange}`;
  const monthPreview = `(${pubMonth}-${pubYear})`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card-strong max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="gradient-text">Send Galley Proof</DialogTitle>
          <DialogDescription>
            Upload files, edit publication details, and optionally edit article content before sending.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="files">Files & Details</TabsTrigger>
            <TabsTrigger value="metadata">Publication Info</TabsTrigger>
            <TabsTrigger value="editor">Edit Content</TabsTrigger>
          </TabsList>

          {/* Tab 1: Files & Article Info */}
          <TabsContent value="files" className="space-y-4 pt-2">
            {/* Article info */}
            <div className="p-3 rounded-lg bg-muted/30 text-sm space-y-1">
              <p><span className="text-muted-foreground">Article:</span> {article?.title}</p>
              <p><span className="text-muted-foreground">Author:</span> {authorProfile?.full_name || 'N/A'} ({authorProfile?.email || 'N/A'})</p>
              <p><span className="text-muted-foreground">Ref:</span> {article?.reference_number}</p>
              <p><span className="text-muted-foreground">Deadline:</span> {isFirstPublication ? '2 hours' : '2 days'} from now</p>
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
          </TabsContent>

          {/* Tab 2: Publication Metadata */}
          <TabsContent value="metadata" className="space-y-4 pt-2">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm">
              <p className="font-medium text-foreground mb-1">Citation Preview:</p>
              <p className="font-mono text-primary">{citationPreview}</p>
              <p className="font-mono text-primary">{monthPreview}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pub-year">Year</Label>
                <Input
                  id="pub-year"
                  value={pubYear}
                  onChange={(e) => setPubYear(e.target.value)}
                  placeholder="2024"
                  className="glass-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pub-month">Month</Label>
                <select
                  id="pub-month"
                  value={pubMonth}
                  onChange={(e) => setPubMonth(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {MONTH_NAMES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pub-volume">Volume</Label>
                <Input
                  id="pub-volume"
                  value={pubVolume}
                  onChange={(e) => setPubVolume(e.target.value)}
                  placeholder="10"
                  className="glass-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pub-issue">Issue</Label>
                <Input
                  id="pub-issue"
                  value={pubIssue}
                  onChange={(e) => setPubIssue(e.target.value)}
                  placeholder="12"
                  className="glass-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pub-pages">Page Range</Label>
              <Input
                id="pub-pages"
                value={pubPageRange}
                onChange={(e) => setPubPageRange(e.target.value)}
                placeholder="1-4"
                className="glass-input"
              />
            </div>
          </TabsContent>

          {/* Tab 3: Rich Text Editor */}
          <TabsContent value="editor" className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Edit the article content below before sending galley proof. This acts like a Word editor.
            </p>
            {editorLoaded && (
              <RichTextEditor
                content={editorContent}
                onChange={setEditorContent}
                className="min-h-[300px]"
              />
            )}
          </TabsContent>
        </Tabs>

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
