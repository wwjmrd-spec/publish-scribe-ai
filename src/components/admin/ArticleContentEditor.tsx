import React, { useState } from 'react';
import { RichTextEditor } from '@/components/ui/RichTextEditor';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/layout/GlassCard';
import { GlassSpinner } from '@/components/ui/GlassSpinner';
import { Save, CheckCircle, X, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ArticleContentEditorProps {
  articleId: string;
  initialContent: string;
  articleTitle: string;
  referenceNumber: string;
  onClose: () => void;
}

export function ArticleContentEditor({
  articleId,
  initialContent,
  articleTitle,
  referenceNumber,
  onClose,
}: ArticleContentEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const queryClient = useQueryClient();

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('articles')
        .update({ formatted_content: content } as any)
        .eq('id', articleId);
      if (error) throw error;
      toast.success('Content saved successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-formatting-articles'] });
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApproveAndSendGalleyProof = async () => {
    setApproving(true);
    try {
      const { error: saveError } = await supabase
        .from('articles')
        .update({
          formatted_content: content,
          formatting_status: 'approved',
          formatting_approved_at: new Date().toISOString(),
        } as any)
        .eq('id', articleId);
      if (saveError) throw saveError;

      const { data: article } = await supabase
        .from('articles')
        .select('*, profiles:author_id (full_name, email)')
        .eq('id', articleId)
        .single();

      if (article) {
        const authorProfile = article.profiles as any;
        if (authorProfile?.email) {
          await supabase.functions.invoke('send-email', {
            body: {
              to: authorProfile.email,
              template: 'custom',
              subject: `Galley Proof Ready - ${article.reference_number}`,
              html: buildGalleyProofAuthorEmail(article, authorProfile),
            },
          });
        }

        await supabase.from('notifications').insert({
          user_id: article.author_id,
          title: 'Galley Proof Ready 📄',
          message: `The galley proof for your article "${article.title}" has been approved and is ready for your review.`,
          type: 'info',
          link: '/author/articles',
        });
      }

      toast.success('Article approved & galley proof email sent to author!');
      queryClient.invalidateQueries({ queryKey: ['admin-formatting-articles'] });
      onClose();
    } catch (err: any) {
      toast.error('Failed to approve: ' + err.message);
    } finally {
      setApproving(false);
    }
  };

  const previewHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Times New Roman', Times, serif;
          background: #e5e7eb;
          padding: 20px;
        }
        .page {
          background: white;
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          padding: 15mm;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .page h1 { font-size: 16px; text-align: center; margin: 12px 0; }
        .page h2 { font-size: 14px; margin: 16px 0 8px; }
        .page h3 { font-size: 13px; margin: 12px 0 6px; }
        .page p { text-align: justify; font-size: 11px; line-height: 1.6; margin: 4px 0; }
        .page strong { font-weight: bold; }
        .page em { font-style: italic; }
        .page ul, .page ol { margin: 4px 0 4px 20px; font-size: 11px; }
        .page table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .page td, .page th { border: 1px solid #ccc; padding: 4px 6px; font-size: 10px; }
        .page th { background: #f0f0f0; font-weight: bold; }
        .page hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }
      </style>
    </head>
    <body>
      <div class="page">
        ${content}
      </div>
    </body>
    </html>
  `;

  return (
    <>
      <GlassCard className="mt-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg">Edit Formatted Article</h3>
            <p className="text-sm text-muted-foreground">{referenceNumber} — {articleTitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(true)} title="Preview as PDF">
              <Eye className="w-4 h-4 mr-1" />
              Preview PDF
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* PDF-like editor container — grey surround + white A4 page */}
        <div className="rounded-lg p-6 overflow-auto" style={{ maxHeight: '70vh', background: '#e5e7eb' }}>
          <div
            className="mx-auto rounded shadow-lg"
            style={{
              width: '210mm',
              maxWidth: '100%',
              minHeight: '297mm',
              padding: '15mm',
              background: '#ffffff',
              color: '#000000',
              fontFamily: "'Times New Roman', Times, serif",
              fontSize: '12px',
              lineHeight: '1.6',
            }}
          >
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="Article content will appear here after AI formatting..."
              minHeight="500px"
              className="border-0 [&_.tiptap]:!bg-transparent [&_.tiptap]:!text-black [&_.ProseMirror]:!bg-transparent [&_.ProseMirror]:!text-black"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-4">
          <Button variant="outline" onClick={() => setShowPreview(true)}>
            <Eye className="w-4 h-4 mr-2" />
            Preview PDF
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            {saving ? <GlassSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Draft
          </Button>
          <Button onClick={handleApproveAndSendGalleyProof} disabled={approving}>
            {approving ? <GlassSpinner size="sm" className="mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            Approve & Send Galley Proof
          </Button>
        </div>
      </GlassCard>

      {/* PDF Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[95vh] p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>PDF Preview — {referenceNumber}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-[hsl(var(--muted))]" style={{ height: '80vh' }}>
            <iframe
              srcDoc={previewHtml}
              className="w-full h-full border-0"
              title="PDF Preview"
              style={{ minHeight: '80vh' }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function buildGalleyProofAuthorEmail(article: any, authorProfile: any): string {
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
  const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background-color:#0d1528;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#0d1528"><tr><td align="center" style="padding:40px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
<tr><td align="center" style="padding-bottom:32px;"><img src="https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/logo.png?v=1" alt="WWJMRD" width="200" style="display:block;max-width:200px;height:auto;" /></td></tr>
<tr><td bgcolor="#151d35" style="background-color:#151d35;border-radius:12px;padding:32px 28px;border:1px solid rgba(255,255,255,0.08);">
<h1 style="font-family:${font};font-size:24px;color:#ffffff;text-align:center;margin:0 0 24px;">Galley Proof Ready for Review 📄</h1>
<p style="font-family:${font};font-size:16px;color:#d1d5db;line-height:26px;">Hi ${esc(authorProfile.full_name || 'Author')},</p>
<p style="font-family:${font};font-size:16px;color:#d1d5db;line-height:26px;">Your article has been formatted and the galley proof has been approved by our editorial team. Please review it carefully.</p>
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#1a2340" style="background-color:#1a2340;border-radius:8px;margin:20px 0;"><tr><td style="padding:20px;">
<p style="font-family:${font};font-size:16px;font-weight:600;color:#ffffff;margin:0 0 12px;">Article Details:</p>
<table width="100%">
<tr><td style="font-family:${font};font-size:14px;color:#9ca3af;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">Reference</td><td align="right" style="font-family:${font};font-size:14px;color:#ffffff;font-weight:500;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">${esc(article.reference_number)}</td></tr>
<tr><td style="font-family:${font};font-size:14px;color:#9ca3af;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">Title</td><td align="right" style="font-family:${font};font-size:14px;color:#ffffff;font-weight:500;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">${esc(article.title)}</td></tr>
<tr><td style="font-family:${font};font-size:14px;color:#9ca3af;padding:10px 0;">Status</td><td align="right" style="font-family:${font};font-size:14px;color:#10b981;font-weight:600;padding:10px 0;">Galley Proof Approved</td></tr>
</table></td></tr></table>
<table width="100%" style="margin:28px 0;"><tr><td align="center"><a href="https://wwjmrdai.lovable.app/author/articles" style="display:inline-block;background-color:#00d4ff;color:#0d1528;font-family:${font};font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;">Review Galley Proof</a></td></tr></table>
<p style="font-family:${font};font-size:14px;color:#9ca3af;">If you have any questions, contact us at support@wwjmrd.com</p>
</td></tr>
<tr><td align="center" style="padding-top:24px;"><p style="font-family:${font};font-size:12px;color:#6b7280;margin:0;">&copy; ${new Date().getFullYear()} WWJMRD. All rights reserved.</p></td></tr>
</table></td></tr></table></body></html>`;
}
