import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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

type EmailTemplate = "password-reset" | "email-verification" | "welcome" | "article-submission" | "payment-confirmation" | "referral-reward" | "article-status-change" | "custom";

interface EmailRequest {
  to: string;
  template: EmailTemplate;
  data?: {
    resetUrl?: string;
    verifyUrl?: string;
    loginUrl?: string;
    userName?: string;
    // Article submission
    articleTitle?: string;
    referenceNumber?: string;
    authorName?: string;
    authorEmail?: string;
    submissionDate?: string;
    coAuthors?: string[];
    // Payment confirmation
    paymentId?: string;
    amount?: number;
    currency?: string;
    articleTitles?: string[];
    transactionId?: string;
    paymentDate?: string;
    discountCode?: string;
    discountAmount?: number;
    finalAmount?: number;
    // Referral reward
    referrerName?: string;
    referredName?: string;
    referredEmail?: string;
    bonusDownloads?: number;
    rewardType?: 'referrer' | 'referred';
    // Article status change
    status?: string;
  };
  // For custom template
  subject?: string;
  html?: string;
  from?: string;
}

// Base styles for email templates
const baseStyles = `
  body {
    background-color: #0d1528;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    margin: 0;
    padding: 0;
  }
  .container {
    max-width: 560px;
    margin: 0 auto;
    padding: 40px 20px;
  }
  .logo {
    text-align: center;
    margin-bottom: 32px;
  }
  .logo img {
    max-width: 200px;
    height: auto;
  }
  .logo-text {
    font-size: 28px;
    font-weight: bold;
    color: #00d4ff;
    margin: 0;
  }
  h1 {
    color: #ffffff;
    font-size: 24px;
    font-weight: 600;
    text-align: center;
    margin: 32px 0 24px;
  }
  p {
    color: #d1d5db;
    font-size: 16px;
    line-height: 26px;
    margin: 16px 0;
  }
  .button-container {
    text-align: center;
    margin: 32px 0;
  }
  .button {
    background-color: #00d4ff;
    border-radius: 8px;
    color: #0d1528 !important;
    font-size: 16px;
    font-weight: 600;
    text-decoration: none;
    display: inline-block;
    padding: 14px 32px;
  }
  .link {
    color: #00d4ff;
    font-size: 14px;
    word-break: break-all;
  }
  hr {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    margin: 32px 0;
  }
  .footer-text {
    color: #9ca3af;
    font-size: 14px;
    line-height: 22px;
  }
  .footer {
    color: #6b7280;
    font-size: 12px;
    text-align: center;
    margin-top: 24px;
  }
  .features-box {
    background-color: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 20px;
    margin: 24px 0;
  }
  .features-title {
    color: #ffffff;
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 12px;
  }
  .feature-item {
    color: #d1d5db;
    font-size: 14px;
    line-height: 24px;
    margin: 4px 0;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .info-label {
    color: #9ca3af;
    font-size: 14px;
  }
  .info-value {
    color: #ffffff;
    font-size: 14px;
    font-weight: 500;
  }
  .invoice-header {
    background-color: rgba(0, 212, 255, 0.1);
    border-radius: 8px;
    padding: 20px;
    text-align: center;
    margin-bottom: 24px;
  }
  .invoice-number {
    color: #00d4ff;
    font-size: 14px;
    margin: 0;
  }
  .amount-large {
    color: #ffffff;
    font-size: 36px;
    font-weight: 700;
    margin: 8px 0;
  }
  .status-badge {
    display: inline-block;
    background-color: #10b981;
    color: #ffffff;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
  }
  .article-list {
    background-color: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 16px;
    margin: 16px 0;
  }
  .article-item {
    color: #d1d5db;
    font-size: 14px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .article-item:last-child {
    border-bottom: none;
  }
`;

const getPasswordResetTemplate = (resetUrl: string, userName: string = "there"): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reset Your Password</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <img src="https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/logo.png?v=1" alt="WWJMRD Logo" width="200" />
    </div>
    
    <h1>Reset Your Password</h1>
    
    <p>Hi ${escapeHtml(userName)},</p>
    
    <p>We received a request to reset your password for your WWJMRD account. Click the button below to set a new password:</p>
    
    <div class="button-container">
      <a href="${escapeHtml(resetUrl)}" class="button">Reset Password</a>
    </div>
    
    <p>Or copy and paste this link into your browser:</p>
    <p class="link"><a href="${escapeHtml(resetUrl)}" style="color: #00d4ff;">${escapeHtml(resetUrl)}</a></p>
    
    <hr>
    
    <p class="footer-text">This link will expire in 1 hour for security reasons. If you didn't request a password reset, you can safely ignore this email.</p>
    
    <p class="footer">© ${new Date().getFullYear()} WWJMRD. All rights reserved.</p>
  </div>
</body>
</html>
`;

const getEmailVerificationTemplate = (verifyUrl: string, userName: string = "there"): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Verify Your Email</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <img src="https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/logo.png?v=1" alt="WWJMRD Logo" width="200" />
    </div>
    
    <h1>Verify Your Email</h1>
    
    <p>Hi ${escapeHtml(userName)},</p>
    
    <p>Welcome to WWJMRD! Please verify your email address to get started with publishing your research articles.</p>
    
    <div class="button-container">
      <a href="${escapeHtml(verifyUrl)}" class="button">Verify Email Address</a>
    </div>
    
    <p>Or copy and paste this link into your browser:</p>
    <p class="link"><a href="${escapeHtml(verifyUrl)}" style="color: #00d4ff;">${escapeHtml(verifyUrl)}</a></p>
    
    <hr>
    
    <div class="features-box">
      <p class="features-title">What you can do with WWJMRD:</p>
      <p class="feature-item">📝 Submit research articles for publication</p>
      <p class="feature-item">📊 Track your submission status</p>
      <p class="feature-item">🏆 Receive publication certificates</p>
      <p class="feature-item">👥 Manage co-authors</p>
    </div>
    
    <hr>
    
    <p class="footer-text">This link will expire in 24 hours. If you didn't create an account with WWJMRD, you can safely ignore this email.</p>
    
    <p class="footer">© ${new Date().getFullYear()} WWJMRD. All rights reserved.</p>
  </div>
</body>
</html>
`;

const getWelcomeTemplate = (loginUrl: string, userName: string = "there"): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Welcome to WWJMRD</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <img src="https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/logo.png?v=1" alt="WWJMRD Logo" width="200" />
    </div>
    
    <h1>Welcome to WWJMRD! 🎉</h1>
    
    <p>Hi ${escapeHtml(userName)},</p>
    
    <p>Congratulations! Your email has been verified and your WWJMRD account is now active. You're ready to start submitting your research articles for publication.</p>
    
    <div class="button-container">
      <a href="${escapeHtml(loginUrl)}" class="button">Go to Dashboard</a>
    </div>
    
    <hr>
    
    <p class="footer-text">If you have any questions, don't hesitate to reach out to our support team at info@wwjmrd.com.</p>
    
    <p class="footer">© ${new Date().getFullYear()} WWJMRD. All rights reserved.</p>
  </div>
</body>
</html>
`;

const getArticleSubmissionTemplate = (data: EmailRequest["data"], isAdmin: boolean = false): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Article Submission ${isAdmin ? 'Notification' : 'Confirmation'}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <img src="https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/logo.png?v=1" alt="WWJMRD Logo" width="200" />
    </div>
    
    <h1>${isAdmin ? 'New Article Submitted' : 'Article Submitted Successfully'} 📄</h1>
    
    <p>${isAdmin ? 'A new article has been submitted for review.' : `Hi ${escapeHtml(data?.authorName || 'Author')},`}</p>
    
    ${isAdmin ? '' : '<p>Thank you for submitting your article to WWJMRD. Your submission has been received and is now under review.</p>'}
    
    <div class="features-box">
      <p class="features-title">Submission Details:</p>
      <div class="info-row">
        <span class="info-label">Reference Number</span>
        <span class="info-value">${escapeHtml(data?.referenceNumber || 'N/A')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Title</span>
        <span class="info-value">${escapeHtml(data?.articleTitle || 'N/A')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Author</span>
        <span class="info-value">${escapeHtml(data?.authorName || 'N/A')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Email</span>
        <span class="info-value">${escapeHtml(data?.authorEmail || 'N/A')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Submission Date</span>
        <span class="info-value">${escapeHtml(data?.submissionDate || new Date().toLocaleDateString())}</span>
      </div>
      ${data?.coAuthors && data.coAuthors.length > 0 ? `
      <div class="info-row">
        <span class="info-label">Co-Authors</span>
        <span class="info-value">${data.coAuthors.map(name => escapeHtml(name)).join(', ')}</span>
      </div>
      ` : ''}
    </div>
    
    ${isAdmin ? `
    <div class="button-container">
      <a href="https://wwjmrdai.lovable.app/admin/articles" class="button">Review Article</a>
    </div>
    ` : `
    <p>What happens next:</p>
    <div class="features-box">
      <p class="feature-item">1️⃣ Your article will be reviewed by our editorial team</p>
      <p class="feature-item">2️⃣ You'll receive feedback and status updates via email</p>
      <p class="feature-item">3️⃣ Once approved, you can complete the publication fee</p>
      <p class="feature-item">4️⃣ After payment, you'll receive your publication certificate</p>
    </div>
    
    <div class="button-container">
      <a href="https://wwjmrdai.lovable.app/author/articles" class="button">Track Your Article</a>
    </div>
    `}
    
    <hr>
    
    <p class="footer-text">If you have any questions, contact us at info@wwjmrd.com</p>
    
    <p class="footer">© ${new Date().getFullYear()} WWJMRD. All rights reserved.</p>
  </div>
</body>
</html>
`;

const getPaymentConfirmationTemplate = (data: EmailRequest["data"], isAdmin: boolean = false): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payment ${isAdmin ? 'Notification' : 'Confirmation'}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <img src="https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/logo.png?v=1" alt="WWJMRD Logo" width="200" />
    </div>
    
    <h1>${isAdmin ? 'Payment Received' : 'Payment Successful'} ✅</h1>
    
    <div class="invoice-header">
      <p class="invoice-number">Invoice #${data?.paymentId || 'N/A'}</p>
      <p class="amount-large">${data?.currency === 'INR' ? '₹' : '$'}${data?.finalAmount?.toFixed(2) || data?.amount?.toFixed(2) || '0.00'}</p>
      <span class="status-badge">PAID</span>
    </div>
    
    <p>${isAdmin ? `Payment received from ${escapeHtml(data?.authorName || 'Author')} (${escapeHtml(data?.authorEmail || 'N/A')}).` : `Hi ${escapeHtml(data?.authorName || 'Author')},`}</p>
    
    ${isAdmin ? '' : '<p>Thank you for your payment! Your publication fee has been processed successfully.</p>'}
    
    <div class="features-box">
      <p class="features-title">Payment Details:</p>
      <div class="info-row">
        <span class="info-label">Transaction ID</span>
        <span class="info-value">${data?.transactionId || 'N/A'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Payment Date</span>
        <span class="info-value">${data?.paymentDate || new Date().toLocaleDateString()}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Original Amount</span>
        <span class="info-value">${data?.currency === 'INR' ? '₹' : '$'}${data?.amount?.toFixed(2) || '0.00'}</span>
      </div>
      ${data?.discountCode ? `
      <div class="info-row">
        <span class="info-label">Discount (${data.discountCode})</span>
        <span class="info-value">-${data?.currency === 'INR' ? '₹' : '$'}${data?.discountAmount?.toFixed(2) || '0.00'}</span>
      </div>
      ` : ''}
      <div class="info-row">
        <span class="info-label">Total Paid</span>
        <span class="info-value" style="color: #10b981; font-weight: 700;">${data?.currency === 'INR' ? '₹' : '$'}${data?.finalAmount?.toFixed(2) || data?.amount?.toFixed(2) || '0.00'}</span>
      </div>
    </div>
    
    ${data?.articleTitles && data.articleTitles.length > 0 ? `
    <div class="article-list">
      <p class="features-title">Articles:</p>
      ${data.articleTitles.map(title => `<div class="article-item">📄 ${escapeHtml(title)}</div>`).join('')}
    </div>
    ` : ''}
    
    ${isAdmin ? `
    <div class="button-container">
      <a href="https://wwjmrdai.lovable.app/admin/articles" class="button">View Articles</a>
    </div>
    ` : `
    <p>What happens next:</p>
    <div class="features-box">
      <p class="feature-item">✅ Your payment has been confirmed</p>
      <p class="feature-item">📋 Your article will be processed for publication</p>
      <p class="feature-item">📜 You'll receive your publication certificate soon</p>
    </div>
    
    <div class="button-container">
      <a href="https://wwjmrdai.lovable.app/author/certificates" class="button">View Certificates</a>
    </div>
    `}
    
    <hr>
    
    <p class="footer-text">This email serves as your payment receipt. For any queries, contact us at info@wwjmrd.com</p>
    
    <p class="footer">© ${new Date().getFullYear()} WWJMRD. All rights reserved.</p>
  </div>
</body>
</html>
`;

const getReferralRewardTemplate = (data: EmailRequest["data"]): string => {
  const isReferrer = data?.rewardType === 'referrer';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${isReferrer ? 'Referral Reward Earned!' : 'Your Referral Helped Someone!'}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <img src="https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/logo.png?v=1" alt="WWJMRD Logo" width="200" />
    </div>
    
    <h1>${isReferrer ? 'Referral Reward Earned! 🎉' : 'Congratulations on Your Publication! 🎉'}</h1>
    
    <p>Hi ${escapeHtml(isReferrer ? (data?.referrerName || 'Author') : (data?.referredName || 'Author'))},</p>
    
    ${isReferrer ? `
    <p>Great news! Your referred author <strong>${escapeHtml(data?.referredName || 'an author')}</strong> just got their article published on WWJMRD.</p>
    
    <div class="invoice-header" style="background-color: rgba(168, 85, 247, 0.15);">
      <p style="color: #a855f7; font-size: 14px; margin: 0;">REWARD EARNED</p>
      <p class="amount-large" style="color: #a855f7;">+${data?.bonusDownloads || 2}</p>
      <p style="color: #d1d5db; font-size: 14px; margin: 0;">Bonus Review Report Downloads</p>
    </div>
    
    <p>These bonus downloads have been automatically added to your account. You can use them to download AI review reports for your articles.</p>
    ` : `
    <p>Your article <strong>"${escapeHtml(data?.articleTitle || '')}"</strong> has been published on WWJMRD!</p>
    
    <p>Thanks to your publication, the author who referred you (<strong>${escapeHtml(data?.referrerName || 'your referrer')}</strong>) has also earned bonus review report downloads as a reward.</p>
    `}
    
    <div class="features-box">
      <p class="features-title">Keep Earning Rewards:</p>
      <p class="feature-item">🔗 Share your unique referral code with other researchers</p>
      <p class="feature-item">📝 When they sign up and get published, you earn <strong>+2 bonus downloads</strong></p>
      <p class="feature-item">🏆 There's no limit to how many rewards you can earn!</p>
    </div>
    
    <div class="button-container">
      <a href="https://wwjmrdai.lovable.app/author/rewards" class="button">${isReferrer ? 'View Your Rewards' : 'View Your Referral Code'}</a>
    </div>
    
    <hr>
    
    <p class="footer-text">Keep sharing your referral code to earn more rewards. For any questions, contact us at info@wwjmrd.com</p>
    
    <p class="footer">© ${new Date().getFullYear()} WWJMRD. All rights reserved.</p>
  </div>
</body>
</html>
`;
};

const getStatusInfo = (status: string): { emoji: string; title: string; message: string; color: string } => {
  switch (status) {
    case 'under_review':
      return {
        emoji: '🔍',
        title: 'Article Under Review',
        message: 'Your article is now being reviewed by our editorial team. We will notify you once the review is complete.',
        color: '#eab308',
      };
    case 'pending_fee':
      return {
        emoji: '💳',
        title: 'Publication Fee Required',
        message: 'Great news! Your article has been reviewed and accepted. Please complete the publication fee payment to proceed with publishing.',
        color: '#f97316',
      };
    case 'rejected':
      return {
        emoji: '❌',
        title: 'Article Not Accepted',
        message: 'Unfortunately, your article did not meet our publication criteria at this time. You are welcome to revise and resubmit.',
        color: '#ef4444',
      };
    default:
      return {
        emoji: 'ℹ️',
        title: 'Article Status Updated',
        message: `Your article status has been updated to: ${status.replace(/_/g, ' ')}.`,
        color: '#00d4ff',
      };
  }
};

const getArticleStatusChangeTemplate = (data: EmailRequest["data"]): string => {
  const info = getStatusInfo(data?.status || '');
  const isPendingFee = data?.status === 'pending_fee';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${info.title}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <img src="https://myjbbbytbzzzsaaiohrz.supabase.co/storage/v1/object/public/email-assets/logo.png?v=1" alt="WWJMRD Logo" width="200" />
    </div>
    
    <h1>${info.emoji} ${info.title}</h1>
    
    <p>Hi ${escapeHtml(data?.authorName || 'Author')},</p>
    
    <p>${info.message}</p>
    
    <div class="features-box">
      <p class="features-title">Article Details:</p>
      <div class="info-row">
        <span class="info-label">Reference Number</span>
        <span class="info-value">${escapeHtml(data?.referenceNumber || 'N/A')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Title</span>
        <span class="info-value">${escapeHtml(data?.articleTitle || 'N/A')}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Status</span>
        <span class="info-value" style="color: ${info.color}; font-weight: 600;">${(data?.status || '').replace(/_/g, ' ').replace(/\\b\\w/g, (l: string) => l.toUpperCase())}</span>
      </div>
    </div>
    
    ${isPendingFee ? `
    <p>Please log in to your dashboard to complete the payment and proceed with publication.</p>
    <div class="button-container">
      <a href="https://wwjmrdai.lovable.app/author/articles" class="button">Pay Publication Fee</a>
    </div>
    ` : `
    <div class="button-container">
      <a href="https://wwjmrdai.lovable.app/author/articles" class="button">View My Articles</a>
    </div>
    `}
    
    <hr>
    
    <p class="footer-text">If you have any questions about this update, contact us at info@wwjmrd.com</p>
    
    <p class="footer">© ${new Date().getFullYear()} WWJMRD. All rights reserved.</p>
  </div>
</body>
</html>
`;
};

const getEmailContent = (
  template: EmailTemplate,
  data: EmailRequest["data"],
  isAdmin: boolean = false
): { subject: string; html: string } => {
  switch (template) {
    case "password-reset":
      return {
        subject: "Reset Your WWJMRD Password",
        html: getPasswordResetTemplate(data?.resetUrl || "", data?.userName),
      };

    case "email-verification":
      return {
        subject: "Verify Your WWJMRD Email",
        html: getEmailVerificationTemplate(data?.verifyUrl || "", data?.userName),
      };

    case "welcome":
      return {
        subject: "Welcome to WWJMRD! 🎉",
        html: getWelcomeTemplate(data?.loginUrl || "", data?.userName),
      };

    case "article-submission":
      return {
        subject: isAdmin 
          ? `New Article Submitted: ${data?.referenceNumber || 'N/A'}` 
          : `Article Submitted Successfully - ${data?.referenceNumber || 'Ref'}`,
        html: getArticleSubmissionTemplate(data, isAdmin),
      };

    case "payment-confirmation":
      return {
        subject: isAdmin 
          ? `Payment Received: ${data?.currency === 'INR' ? '₹' : '$'}${data?.finalAmount?.toFixed(2) || data?.amount?.toFixed(2)}` 
          : `Payment Confirmation - Invoice #${data?.paymentId || 'N/A'}`,
        html: getPaymentConfirmationTemplate(data, isAdmin),
      };

    case "referral-reward":
      return {
        subject: data?.rewardType === 'referrer' 
          ? 'You Earned a Referral Reward! 🎉 +2 Bonus Downloads'
          : 'Your Article Was Published & Your Referrer Was Rewarded! 🎉',
        html: getReferralRewardTemplate(data),
      };

    case "article-status-change": {
      const statusInfo = getStatusInfo(data?.status || '');
      return {
        subject: `${statusInfo.emoji} ${statusInfo.title} - ${data?.referenceNumber || 'Your Article'}`,
        html: getArticleStatusChangeTemplate(data),
      };
    }

    default:
      throw new Error(`Unknown template: ${template}`);
  }
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the request - accept valid user JWT or service role key
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isServiceRole = token === serviceRoleKey;

    if (!isServiceRole) {
      // Validate as user JWT
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("Auth failed for send-email:", userError?.message);
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      console.log("Email request authenticated for user:", user.id);
    } else {
      console.log("Email request authenticated via service role");
    }

    const body: EmailRequest & { isAdmin?: boolean } = await req.json();
    const { to, template, data, subject, html, from, isAdmin } = body;

    // Validate required fields
    if (!to) {
      throw new Error("Missing required field: to");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      throw new Error("Invalid email address format");
    }

    let emailSubject: string;
    let emailHtml: string;

    if (template === "custom") {
      // Custom template - use provided subject and html
      if (!subject || !html) {
        throw new Error("Custom template requires subject and html fields");
      }
      emailSubject = subject;
      emailHtml = html;
    } else if (template) {
      // Use predefined template
      const content = getEmailContent(template, data, isAdmin);
      emailSubject = content.subject;
      emailHtml = content.html;
    } else {
      throw new Error("Missing required field: template");
    }

    console.log(`Sending ${template} email to: ${to}, subject: ${emailSubject}, isAdmin: ${isAdmin}`);

    const emailResponse = await resend.emails.send({
      from: from || "WWJMRD <info@wwjmrd.com>",
      to: [to],
      subject: emailSubject,
      html: emailHtml,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
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
