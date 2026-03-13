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
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

interface WithdrawArticleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: {
    id: string;
    title: string;
    reference_number: string;
    status: string | null;
  };
}

export function WithdrawArticleDialog({
  open,
  onOpenChange,
  article,
}: WithdrawArticleDialogProps) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isPaid = ['paid', 'published', 'payment_under_review'].includes(article.status || '');
  const wasFeeStage = ['pending_fee', 'paid', 'payment_under_review', 'published'].includes(article.status || '');

  const handleWithdraw = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('articles')
        .update({ status: 'withdrawn' as any })
        .eq('id', article.id)
        .eq('author_id', user.id);

      if (error) throw error;

      // Send withdrawal notification via edge function
      await supabase.functions.invoke('send-email', {
        body: {
          to: user.email,
          template: 'custom',
          subject: `Article Withdrawn – ${article.reference_number}`,
          html: buildAuthorEmailHtml(article.title, article.reference_number, wasFeeStage),
        },
      });

      // Notify admin
      const { data: adminSetting } = await supabase
        .from('admin_settings')
        .select('setting_value')
        .eq('setting_key', 'notification_email')
        .single();

      const adminEmail = adminSetting?.setting_value || 'shubhmeena23@gmail.com';

      await supabase.functions.invoke('send-email', {
        body: {
          to: adminEmail,
          template: 'custom',
          subject: `Article Withdrawn by Author – ${article.reference_number}`,
          html: buildAdminEmailHtml(article.title, article.reference_number, user.email || '', wasFeeStage),
        },
      });

      queryClient.invalidateQueries({ queryKey: ['my-articles'] });
      toast.success('Article withdrawn successfully');
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to withdraw article');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw Article</DialogTitle>
          <DialogDescription>
            Are you sure you want to withdraw "{article.title}" ({article.reference_number})?
          </DialogDescription>
        </DialogHeader>

        {wasFeeStage && (
          <Alert variant="destructive" className="my-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Important – Non-Refundable</AlertTitle>
            <AlertDescription className="text-sm leading-relaxed">
              The publication fee will <strong>not</strong> be refunded. However, you may submit and get published any other article within <strong>3 months</strong> from the date the payment was made.
            </AlertDescription>
          </Alert>
        )}

        <p className="text-sm text-muted-foreground">
          This action cannot be undone. The article will be marked as withdrawn.
        </p>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleWithdraw} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirm Withdrawal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function buildAuthorEmailHtml(title: string, refNum: string, showFeeNote: boolean): string {
  const feeNote = showFeeNote
    ? `<tr><td style="padding:16px 24px; background-color:rgba(239,68,68,0.1); border-left:4px solid #ef4444; margin:16px 0; border-radius:4px;">
        <p style="color:#fbbf24; font-weight:600; margin:0 0 8px 0;">⚠️ Important</p>
        <p style="color:#94a3b8; margin:0; font-size:14px; line-height:1.6;">
          The publication fee will <strong style="color:#f1f5f9;">not</strong> be refunded. You may submit and get published any other article within <strong style="color:#f1f5f9;">3 months</strong> from the date the payment was made.
        </p>
      </td></tr>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#94a3b8;">
      <h2 style="color:#f1f5f9;">Article Withdrawn</h2>
      <p>Your article <strong style="color:#f1f5f9;">"${title}"</strong> (Ref: ${refNum}) has been successfully withdrawn.</p>
      ${feeNote}
      <p style="margin-top:16px;">If you have any questions, please contact us at <a href="mailto:support@wwjmrd.com" style="color:#06b6d4;">support@wwjmrd.com</a>.</p>
    </div>
  `;
}

function buildAdminEmailHtml(title: string, refNum: string, authorEmail: string, hadPaidFee: boolean): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#94a3b8;">
      <h2 style="color:#f1f5f9;">Article Withdrawal Notice</h2>
      <p>An author has withdrawn their article:</p>
      <ul style="color:#f1f5f9;">
        <li><strong>Title:</strong> ${title}</li>
        <li><strong>Ref:</strong> ${refNum}</li>
        <li><strong>Author:</strong> ${authorEmail}</li>
        <li><strong>Fee was paid:</strong> ${hadPaidFee ? 'Yes' : 'No'}</li>
      </ul>
      <p>Please review if any follow-up action is needed.</p>
    </div>
  `;
}
