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

const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`;

const emailH1 = (text: string) =>
  `<h1 style="font-family:${font}; font-size:24px; font-weight:600; color:#ffffff; text-align:center; margin:0 0 24px;">${text}</h1>`;

const emailP = (text: string) =>
  `<p style="font-family:${font}; font-size:16px; line-height:26px; color:#d1d5db; margin:16px 0;">${text}</p>`;

const emailDivider = () =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;"><tr><td style="border-top:1px solid rgba(255,255,255,0.1);"></td></tr></table>`;

const emailInfoRow = (label: string, value: string, valueStyle = "") =>
  `<tr><td style="font-family:${font}; font-size:14px; color:#9ca3af; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06);">${label}</td><td align="right" style="font-family:${font}; font-size:14px; color:#ffffff; font-weight:500; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06);${valueStyle}">${value}</td></tr>`;

const emailInfoBox = (title: string, rows: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;"><tr><td style="padding:20px;"><p style="font-family:${font}; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">${title}</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table></td></tr></table>`;

const emailButton = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0;"><tr><td align="center"><a href="${href}" target="_blank" style="display:inline-block; background-color:#00d4ff; color:#0d1528; font-family:${font}; font-size:16px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:8px;">${label}</a></td></tr></table>`;

const emailFooterText = (text: string) =>
  `<p style="font-family:${font}; font-size:14px; line-height:22px; color:#9ca3af; margin:16px 0 0;">${text}</p>`;

const wrapEmail = (title: string, bodyContent: string): string => `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:#0d1528; width:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0d1528" style="background-color:#0d1528;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/logo.png?v=1" alt="WWJMRD Logo" width="200" style="display:block; max-width:200px; height:auto;" />
            </td>
          </tr>
          <tr>
            <td bgcolor="#151d35" style="background-color:#151d35; border-radius:12px; padding:32px 28px; border:1px solid rgba(255,255,255,0.08);">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="font-family:${font}; font-size:12px; color:#6b7280; margin:0;">&copy; ${new Date().getFullYear()} WWJMRD. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

function buildAuthorEmailHtml(title: string, refNum: string, showFeeNote: boolean): string {
  const feeWarning = showFeeNote
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;">
        <tr><td style="background-color:rgba(239,68,68,0.1); border-left:4px solid #ef4444; border-radius:8px; padding:16px 20px;">
          <p style="font-family:${font}; font-size:14px; font-weight:600; color:#fbbf24; margin:0 0 8px;">⚠️ Important – Non-Refundable</p>
          <p style="font-family:${font}; font-size:14px; line-height:22px; color:#d1d5db; margin:0;">The publication fee will <strong style="color:#ffffff;">not</strong> be refunded. However, you may submit and get published any other article within <strong style="color:#ffffff;">3 months</strong> from the date the payment was made.</p>
        </td></tr>
      </table>`
    : '';

  const body = `
    ${emailH1("Article Withdrawn 📋")}
    ${emailP("Your article has been successfully withdrawn from WWJMRD.")}
    ${emailInfoBox("Withdrawal Details:", [
      emailInfoRow("Title", title),
      emailInfoRow("Reference Number", refNum),
      emailInfoRow("Status", "Withdrawn", " color:#ef4444; font-weight:700;"),
      emailInfoRow("Date", new Date().toLocaleDateString()),
    ].join(""))}
    ${feeWarning}
    ${emailButton("https://wwjmrdai.lovable.app/author/articles", "View My Articles")}
    ${emailDivider()}
    ${emailFooterText("If you have any questions, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail("Article Withdrawn", body);
}

function buildAdminEmailHtml(title: string, refNum: string, authorEmail: string, hadPaidFee: boolean): string {
  const body = `
    ${emailH1("Article Withdrawal Notice 🔔")}
    ${emailP("An author has withdrawn their article. Please review if any follow-up action is needed.")}
    ${emailInfoBox("Withdrawal Details:", [
      emailInfoRow("Title", title),
      emailInfoRow("Reference Number", refNum),
      emailInfoRow("Author Email", authorEmail),
      emailInfoRow("Fee Was Paid", hadPaidFee ? '<span style="color:#ef4444; font-weight:700;">Yes</span>' : "No"),
      emailInfoRow("Withdrawn On", new Date().toLocaleDateString()),
    ].join(""))}
    ${emailButton("https://wwjmrdai.lovable.app/admin/articles", "Review Articles")}
    ${emailDivider()}
    ${emailFooterText("This is an automated notification from WWJMRD.")}
  `;
  return wrapEmail("Article Withdrawal Notice", body);
}
