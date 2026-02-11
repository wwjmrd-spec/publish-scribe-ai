import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// HTML escape function to prevent XSS in email templates
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ========== AWS SES v2 Signing Helpers ==========

function getAmzDate(): { amzDate: string; dateStamp: string } {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  return { amzDate, dateStamp };
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key instanceof ArrayBuffer ? key : key.buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

async function sha256(message: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  return kSigning;
}

async function sendSESEmail(to: string, subject: string, htmlBody: string, from: string): Promise<any> {
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const region = Deno.env.get("AWS_SES_REGION") || "us-east-1";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS SES credentials not configured");
  }

  const host = `email.${region}.amazonaws.com`;
  const endpoint = `https://${host}/v2/email/outbound-emails`;
  const { amzDate, dateStamp } = getAmzDate();

  const requestBody = JSON.stringify({
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: { Html: { Data: htmlBody, Charset: "UTF-8" } },
      },
    },
    Destination: { ToAddresses: [to] },
    FromEmailAddress: from,
  });

  const payloadHash = await sha256(requestBody);

  // Create canonical request
  const method = "POST";
  const canonicalUri = "/v2/email/outbound-emails";
  const canonicalQueryString = "";
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  // Create string to sign
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  // Calculate signature
  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, "ses");
  const signatureBuffer = await hmacSha256(signingKey, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Host": host,
      "X-Amz-Date": amzDate,
      "Authorization": authorizationHeader,
    },
    body: requestBody,
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error("AWS SES error:", response.status, responseText);
    throw new Error(`AWS SES error [${response.status}]: ${responseText}`);
  }

  let result;
  try {
    result = JSON.parse(responseText);
  } catch {
    result = { MessageId: responseText };
  }

  return result;
}

// ========== Email Templates ==========

type EmailTemplate = "password-reset" | "email-verification" | "welcome" | "article-submission" | "payment-confirmation" | "referral-reward" | "article-status-change" | "custom";

interface EmailRequest {
  to: string;
  template: EmailTemplate;
  data?: {
    resetUrl?: string;
    verifyUrl?: string;
    loginUrl?: string;
    userName?: string;
    articleTitle?: string;
    referenceNumber?: string;
    authorName?: string;
    authorEmail?: string;
    submissionDate?: string;
    coAuthors?: string[];
    paymentId?: string;
    amount?: number;
    currency?: string;
    articleTitles?: string[];
    transactionId?: string;
    paymentDate?: string;
    discountCode?: string;
    discountAmount?: number;
    finalAmount?: number;
    referrerName?: string;
    referredName?: string;
    referredEmail?: string;
    bonusDownloads?: number;
    rewardType?: 'referrer' | 'referred';
    status?: string;
  };
  subject?: string;
  html?: string;
  from?: string;
}

// Email-safe wrapper using table-based layout with bgcolor for universal client support
const wrapEmail = (title: string, bodyContent: string): string => `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#0d1528; width:100%; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0d1528" style="background-color:#0d1528;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; width:100%;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/logo.png?v=1" alt="WWJMRD Logo" width="200" style="display:block; max-width:200px; height:auto;" />
            </td>
          </tr>
          <!-- Body content -->
          <tr>
            <td bgcolor="#151d35" style="background-color:#151d35; border-radius:12px; padding:32px 28px; border:1px solid rgba(255,255,255,0.08);">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:12px; color:#6b7280; margin:0;">&copy; ${new Date().getFullYear()} WWJMRD. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// Reusable inline-styled components for email
const emailH1 = (text: string) =>
  `<h1 style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:24px; font-weight:600; color:#ffffff; text-align:center; margin:0 0 24px;">${text}</h1>`;

const emailP = (text: string, extra = '') =>
  `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; line-height:26px; color:#d1d5db; margin:16px 0;${extra}">${text}</p>`;

const emailButton = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0;"><tr><td align="center"><a href="${href}" target="_blank" style="display:inline-block; background-color:#00d4ff; color:#0d1528; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:8px;">${label}</a></td></tr></table>`;

const emailDivider = () =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;"><tr><td style="border-top:1px solid rgba(255,255,255,0.1);"></td></tr></table>`;

const emailInfoRow = (label: string, value: string, valueStyle = '') =>
  `<tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#9ca3af; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06);">${label}</td><td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#ffffff; font-weight:500; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06);${valueStyle}">${value}</td></tr>`;

const emailInfoBox = (title: string, rows: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;"><tr><td style="padding:20px;"><p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">${title}</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table></td></tr></table>`;

const emailFeatureItem = (text: string) =>
  `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; line-height:24px; color:#d1d5db; margin:4px 0;">${text}</p>`;

const emailFooterText = (text: string) =>
  `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; line-height:22px; color:#9ca3af; margin:16px 0 0;">${text}</p>`;

const getPasswordResetTemplate = (resetUrl: string, userName: string = "there"): string => {
  const body = `
    ${emailH1('Reset Your Password')}
    ${emailP(`Hi ${escapeHtml(userName)},`)}
    ${emailP('We received a request to reset your password for your WWJMRD account. Click the button below to set a new password:')}
    ${emailButton(escapeHtml(resetUrl), 'Reset Password')}
    ${emailP('Or copy and paste this link into your browser:')}
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; word-break:break-all; margin:8px 0;"><a href="${escapeHtml(resetUrl)}" style="color:#00d4ff; text-decoration:underline;">${escapeHtml(resetUrl)}</a></p>
    ${emailDivider()}
    ${emailFooterText('This link will expire in 1 hour for security reasons. If you didn\'t request a password reset, you can safely ignore this email.')}
  `;
  return wrapEmail('Reset Your Password', body);
};

const getEmailVerificationTemplate = (verifyUrl: string, userName: string = "there"): string => {
  const body = `
    ${emailH1('Verify Your Email')}
    ${emailP(`Hi ${escapeHtml(userName)},`)}
    ${emailP('Welcome to WWJMRD! Please verify your email address to get started with publishing your research articles.')}
    ${emailButton(escapeHtml(verifyUrl), 'Verify Email Address')}
    ${emailP('Or copy and paste this link into your browser:')}
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; word-break:break-all; margin:8px 0;"><a href="${escapeHtml(verifyUrl)}" style="color:#00d4ff; text-decoration:underline;">${escapeHtml(verifyUrl)}</a></p>
    ${emailDivider()}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">What you can do with WWJMRD:</p>
        ${emailFeatureItem('📝 Submit research articles for publication')}
        ${emailFeatureItem('📊 Track your submission status')}
        ${emailFeatureItem('🏆 Receive publication certificates')}
        ${emailFeatureItem('👥 Manage co-authors')}
      </td></tr>
    </table>
    ${emailDivider()}
    ${emailFooterText('This link will expire in 24 hours. If you didn\'t create an account with WWJMRD, you can safely ignore this email.')}
  `;
  return wrapEmail('Verify Your Email', body);
};

const getWelcomeTemplate = (loginUrl: string, userName: string = "there"): string => {
  const body = `
    ${emailH1('Welcome to WWJMRD! 🎉')}
    ${emailP(`Hi ${escapeHtml(userName)},`)}
    ${emailP('Congratulations! Your email has been verified and your WWJMRD account is now active. You\'re ready to start submitting your research articles for publication.')}
    ${emailButton(escapeHtml(loginUrl), 'Go to Dashboard')}
    ${emailDivider()}
    ${emailFooterText('If you have any questions, don\'t hesitate to reach out to our support team at info@wwjmrd.com.')}
  `;
  return wrapEmail('Welcome to WWJMRD', body);
};

const getArticleSubmissionTemplate = (data: EmailRequest["data"], isAdmin: boolean = false): string => {
  const infoRows = [
    emailInfoRow('Reference Number', escapeHtml(data?.referenceNumber || 'N/A')),
    emailInfoRow('Title', escapeHtml(data?.articleTitle || 'N/A')),
    emailInfoRow('Author', escapeHtml(data?.authorName || 'N/A')),
    emailInfoRow('Email', escapeHtml(data?.authorEmail || 'N/A')),
    emailInfoRow('Submission Date', escapeHtml(data?.submissionDate || new Date().toLocaleDateString())),
  ];
  if (data?.coAuthors && data.coAuthors.length > 0) {
    infoRows.push(emailInfoRow('Co-Authors', data.coAuthors.map(name => escapeHtml(name)).join(', ')));
  }

  const body = `
    ${emailH1(isAdmin ? 'New Article Submitted 📄' : 'Article Submitted Successfully 📄')}
    ${emailP(isAdmin ? 'A new article has been submitted for review.' : `Hi ${escapeHtml(data?.authorName || 'Author')},`)}
    ${isAdmin ? '' : emailP('Thank you for submitting your article to WWJMRD. Your submission has been received and is now under review.')}
    ${emailInfoBox('Submission Details:', infoRows.join(''))}
    ${isAdmin ? emailButton('https://wwjmrdai.lovable.app/admin/articles', 'Review Article') : `
      ${emailP('What happens next:')}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
        <tr><td style="padding:20px;">
          ${emailFeatureItem('1️⃣ Your article will be reviewed by our editorial team')}
          ${emailFeatureItem('2️⃣ You\'ll receive feedback and status updates via email')}
          ${emailFeatureItem('3️⃣ Once approved, you can complete the publication fee')}
          ${emailFeatureItem('4️⃣ After payment, you\'ll receive your publication certificate')}
        </td></tr>
      </table>
      ${emailButton('https://wwjmrdai.lovable.app/author/articles', 'Track Your Article')}
    `}
    ${emailDivider()}
    ${emailFooterText('If you have any questions, contact us at info@wwjmrd.com')}
  `;
  return wrapEmail(isAdmin ? 'New Article Submitted' : 'Article Submitted Successfully', body);
};

const getPaymentConfirmationTemplate = (data: EmailRequest["data"], isAdmin: boolean = false): string => {
  const currencySymbol = data?.currency === 'INR' ? '₹' : '$';
  const finalAmt = data?.finalAmount?.toFixed(2) || data?.amount?.toFixed(2) || '0.00';

  let discountRow = '';
  if (data?.discountCode) {
    discountRow = emailInfoRow(`Discount (${escapeHtml(data.discountCode)})`, `-${currencySymbol}${data?.discountAmount?.toFixed(2) || '0.00'}`);
  }

  const body = `
    ${emailH1(isAdmin ? 'Payment Received ✅' : 'Payment Successful ✅')}
    <!-- Invoice header -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0d2233" style="background-color:rgba(0,212,255,0.08); border-radius:8px; margin:0 0 24px;">
      <tr><td align="center" style="padding:20px;">
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#00d4ff; margin:0;">Invoice #${escapeHtml(data?.paymentId || 'N/A')}</p>
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:36px; font-weight:700; color:#ffffff; margin:8px 0;">${currencySymbol}${finalAmt}</p>
        <span style="display:inline-block; background-color:#10b981; color:#ffffff; padding:4px 12px; border-radius:20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:600;">PAID</span>
      </td></tr>
    </table>
    ${emailP(isAdmin ? `Payment received from ${escapeHtml(data?.authorName || 'Author')} (${escapeHtml(data?.authorEmail || 'N/A')}).` : `Hi ${escapeHtml(data?.authorName || 'Author')},`)}
    ${isAdmin ? '' : emailP('Thank you for your payment! Your publication fee has been processed successfully.')}
    ${emailInfoBox('Payment Details:', [
      emailInfoRow('Transaction ID', escapeHtml(data?.transactionId || 'N/A')),
      emailInfoRow('Payment Date', escapeHtml(data?.paymentDate || new Date().toLocaleDateString())),
      emailInfoRow('Original Amount', `${currencySymbol}${data?.amount?.toFixed(2) || '0.00'}`),
      discountRow,
      emailInfoRow('Total Paid', `${currencySymbol}${finalAmt}`, ' color:#10b981; font-weight:700;'),
    ].join(''))}
    ${data?.articleTitles && data.articleTitles.length > 0 ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:16px 0;">
      <tr><td style="padding:16px;">
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">Articles:</p>
        ${data.articleTitles.map(title => `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#d1d5db; padding:8px 0; margin:0; border-bottom:1px solid rgba(255,255,255,0.05);">📄 ${escapeHtml(title)}</p>`).join('')}
      </td></tr>
    </table>
    ` : ''}
    ${isAdmin ? emailButton('https://wwjmrdai.lovable.app/admin/articles', 'View Articles') : `
      ${emailP('What happens next:')}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
        <tr><td style="padding:20px;">
          ${emailFeatureItem('✅ Your payment has been confirmed')}
          ${emailFeatureItem('📋 Your article will be processed for publication')}
          ${emailFeatureItem('📜 You\'ll receive your publication certificate soon')}
        </td></tr>
      </table>
      ${emailButton('https://wwjmrdai.lovable.app/author/certificates', 'View Certificates')}
    `}
    ${emailDivider()}
    ${emailFooterText('This email serves as your payment receipt. For any queries, contact us at info@wwjmrd.com')}
  `;
  return wrapEmail(isAdmin ? 'Payment Received' : 'Payment Successful', body);
};

const getReferralRewardTemplate = (data: EmailRequest["data"]): string => {
  const isReferrer = data?.rewardType === 'referrer';

  const body = `
    ${emailH1(isReferrer ? 'Referral Reward Earned! 🎉' : 'Congratulations on Your Publication! 🎉')}
    ${emailP(`Hi ${escapeHtml(isReferrer ? (data?.referrerName || 'Author') : (data?.referredName || 'Author'))},`)}
    ${isReferrer ? `
      ${emailP(`Great news! Your referred author <strong style="color:#ffffff;">${escapeHtml(data?.referredName || 'an author')}</strong> just got their article published on WWJMRD.`)}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1f1535" style="background-color:rgba(168,85,247,0.12); border-radius:8px; margin:20px 0;">
        <tr><td align="center" style="padding:20px;">
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#a855f7; margin:0;">REWARD EARNED</p>
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:36px; font-weight:700; color:#a855f7; margin:8px 0;">+${data?.bonusDownloads || 2}</p>
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#d1d5db; margin:0;">Bonus Review Report Downloads</p>
        </td></tr>
      </table>
      ${emailP('These bonus downloads have been automatically added to your account. You can use them to download AI review reports for your articles.')}
    ` : `
      ${emailP(`Your article <strong style="color:#ffffff;">"${escapeHtml(data?.articleTitle || '')}"</strong> has been published on WWJMRD!`)}
      ${emailP(`Thanks to your publication, the author who referred you (<strong style="color:#ffffff;">${escapeHtml(data?.referrerName || 'your referrer')}</strong>) has also earned bonus review report downloads as a reward.`)}
    `}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">Keep Earning Rewards:</p>
        ${emailFeatureItem('🔗 Share your unique referral code with other researchers')}
        ${emailFeatureItem('📝 When they sign up and get published, you earn <strong style="color:#ffffff;">+2 bonus downloads</strong>')}
        ${emailFeatureItem('🏆 There\'s no limit to how many rewards you can earn!')}
      </td></tr>
    </table>
    ${emailButton('https://wwjmrdai.lovable.app/author/rewards', isReferrer ? 'View Your Rewards' : 'View Your Referral Code')}
    ${emailDivider()}
    ${emailFooterText('Keep sharing your referral code to earn more rewards. For any questions, contact us at info@wwjmrd.com')}
  `;
  return wrapEmail(isReferrer ? 'Referral Reward Earned!' : 'Congratulations on Your Publication!', body);
};

const getStatusInfo = (status: string): { emoji: string; title: string; message: string; color: string } => {
  switch (status) {
    case 'under_review':
      return { emoji: '🔍', title: 'Article Under Review', message: 'Your article is now being reviewed by our editorial team. We will notify you once the review is complete.', color: '#eab308' };
    case 'pending_fee':
      return { emoji: '💳', title: 'Publication Fee Required', message: 'Great news! Your article has been reviewed and accepted. Please complete the publication fee payment to proceed with publishing.', color: '#f97316' };
    case 'rejected':
      return { emoji: '❌', title: 'Article Not Accepted', message: 'Unfortunately, your article did not meet our publication criteria at this time. You are welcome to revise and resubmit.', color: '#ef4444' };
    default:
      return { emoji: 'ℹ️', title: 'Article Status Updated', message: `Your article status has been updated to: ${status.replace(/_/g, ' ')}.`, color: '#00d4ff' };
  }
};

const getArticleStatusChangeTemplate = (data: EmailRequest["data"]): string => {
  const info = getStatusInfo(data?.status || '');
  const isPendingFee = data?.status === 'pending_fee';
  const statusDisplay = (data?.status || '').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

  const body = `
    ${emailH1(`${info.emoji} ${info.title}`)}
    ${emailP(`Hi ${escapeHtml(data?.authorName || 'Author')},`)}
    ${emailP(info.message)}
    ${emailInfoBox('Article Details:', [
      emailInfoRow('Reference Number', escapeHtml(data?.referenceNumber || 'N/A')),
      emailInfoRow('Title', escapeHtml(data?.articleTitle || 'N/A')),
      emailInfoRow('Status', statusDisplay, ` color:${info.color}; font-weight:600;`),
    ].join(''))}
    ${isPendingFee
      ? emailP('Please log in to your dashboard to complete the payment and proceed with publication.') + emailButton('https://wwjmrdai.lovable.app/author/articles', 'Pay Publication Fee')
      : emailButton('https://wwjmrdai.lovable.app/author/articles', 'View My Articles')
    }
    ${emailDivider()}
    ${emailFooterText('If you have any questions about this update, contact us at info@wwjmrd.com')}
  `;
  return wrapEmail(info.title, body);
};

// Template resolver
const getEmailContent = (template: EmailTemplate, data: EmailRequest["data"], isAdmin?: boolean): { subject: string; html: string } => {
  switch (template) {
    case "password-reset":
      return { subject: "Reset Your Password - WWJMRD", html: getPasswordResetTemplate(data?.resetUrl || '', data?.userName) };
    case "email-verification":
      return { subject: "Verify Your Email - WWJMRD", html: getEmailVerificationTemplate(data?.verifyUrl || '', data?.userName) };
    case "welcome":
      return { subject: "Welcome to WWJMRD! 🎉", html: getWelcomeTemplate(data?.loginUrl || '', data?.userName) };
    case "article-submission":
      return {
        subject: isAdmin ? `New Article Submitted: ${data?.articleTitle || 'Untitled'}` : `Article Submitted Successfully - ${data?.referenceNumber || ''}`,
        html: getArticleSubmissionTemplate(data, isAdmin),
      };
    case "payment-confirmation":
      return {
        subject: isAdmin ? `Payment Received from ${data?.authorName || 'Author'}` : "Payment Successful - WWJMRD",
        html: getPaymentConfirmationTemplate(data, isAdmin),
      };
    case "referral-reward":
      return {
        subject: data?.rewardType === 'referrer' ? "Referral Reward Earned! 🎉" : "Congratulations on Your Publication! 🎉",
        html: getReferralRewardTemplate(data),
      };
    case "article-status-change":
      return {
        subject: `Article Status Updated: ${(data?.status || '').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}`,
        html: getArticleStatusChangeTemplate(data),
      };
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No Authorization header provided");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isServiceRole = token === serviceRoleKey;

    if (!isServiceRole) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userError } = await authClient.auth.getUser();
      if (userError || !userData?.user) {
        console.error("Auth failed for send-email:", userError?.message || "No user found");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      console.log("Email request authenticated for user:", userData.user.id);
    } else {
      console.log("Email request authenticated via service role");
    }

    const body: EmailRequest & { isAdmin?: boolean } = await req.json();
    const { to, template, data, subject, html, from, isAdmin } = body;

    if (!to) {
      throw new Error("Missing required field: to");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      throw new Error("Invalid email address format");
    }

    let emailSubject: string;
    let emailHtml: string;

    if (template === "custom") {
      if (!subject || !html) {
        throw new Error("Custom template requires subject and html fields");
      }
      emailSubject = subject;
      emailHtml = html;
    } else if (template) {
      const content = getEmailContent(template, data, isAdmin);
      emailSubject = content.subject;
      emailHtml = content.html;
    } else {
      throw new Error("Missing required field: template");
    }

    console.log(`Sending ${template} email to: ${to}, subject: ${emailSubject}, isAdmin: ${isAdmin}`);

    const fromAddress = from || "WWJMRD <info@wwjmrd.com>";
    const emailResponse = await sendSESEmail(to, emailSubject, emailHtml, fromAddress);

    console.log("Email sent successfully via AWS SES:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-email function:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send email. Please try again." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
