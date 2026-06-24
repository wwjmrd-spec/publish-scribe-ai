import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getEmailErrorGuidance(message: string, provider?: string) {
  if (provider === "aws-ses" && /MessageRejected|Email address is not verified/i.test(message)) {
    return "AWS SES rejected the sender. Verify the From address/domain in the same SES region, or use a verified sender address.";
  }
  if (/not configured/i.test(message)) {
    return "This email provider is missing required credentials or settings.";
  }
  return undefined;
}

// HTML escape function to prevent XSS in email templates
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type EmailTemplate =
  | "password-reset"
  | "email-verification"
  | "welcome"
  | "article-submission"
  | "article-resubmission"
  | "payment-confirmation"
  | "referral-reward"
  | "article-status-change"
  | "review-report-ready"
  | "payment-reminder"
  | "galley-proof-review"
  | "copyright-form-request"
  | "upgrade-to-pro"
  | "manuscript-revise"
  | "manuscript-update"
  | "galley-proof-revision"
  | "galley-proof-approved"
  | "galley-proof-author-corrections"
  | "article-published"
  | "admin-created-credentials"
  | "custom";

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
    rewardType?: "referrer" | "referred";
    referralDiscountCode?: string;
    referralDiscountAmount?: number;
    // Article status change
    status?: string;
  };
  // For custom template
  subject?: string;
  html?: string;
  from?: string;
  // Admin-created-credentials extras
  tempPassword?: string;
  isGeneratedTemp?: boolean;
  // Per-call provider override (used by Settings → Test email)
  providerOverride?: string;
  fromOverride?: string;
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

const emailP = (text: string, extra = "") =>
  `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; line-height:26px; color:#d1d5db; margin:16px 0;${extra}">${text}</p>`;

const emailButton = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0;"><tr><td align="center"><a href="${href}" target="_blank" style="display:inline-block; background-color:#00d4ff; color:#0d1528; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:8px;">${label}</a></td></tr></table>`;

const emailDivider = () =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;"><tr><td style="border-top:1px solid rgba(255,255,255,0.1);"></td></tr></table>`;

const emailInfoRow = (label: string, value: string, valueStyle = "") =>
  `<tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#9ca3af; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06);">${label}</td><td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#ffffff; font-weight:500; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06);${valueStyle}">${value}</td></tr>`;

const emailInfoBox = (title: string, rows: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;"><tr><td style="padding:20px;"><p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">${title}</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table></td></tr></table>`;

const emailFeatureItem = (text: string) =>
  `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; line-height:24px; color:#d1d5db; margin:4px 0;">${text}</p>`;

const emailFooterText = (text: string) =>
  `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; line-height:22px; color:#9ca3af; margin:16px 0 0;">${text}</p>`;

const getPasswordResetTemplate = (resetUrl: string, userName: string = "there"): string => {
  const body = `
    ${emailH1("Reset Your Password")}
    ${emailP(`Hi ${escapeHtml(userName)},`)}
    ${emailP("We received a request to reset your password for your WWJMRD account. Click the button below to set a new password:")}
    ${emailButton(escapeHtml(resetUrl), "Reset Password")}
    ${emailP("Or copy and paste this link into your browser:")}
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; word-break:break-all; margin:8px 0;"><a href="${escapeHtml(resetUrl)}" style="color:#00d4ff; text-decoration:underline;">${escapeHtml(resetUrl)}</a></p>
    ${emailDivider()}
    ${emailFooterText("This link will expire in 1 hour for security reasons. If you didn't request a password reset, you can safely ignore this email.")}
  `;
  return wrapEmail("Reset Your Password", body);
};

const getEmailVerificationTemplate = (verifyUrl: string, userName: string = "there"): string => {
  const body = `
    ${emailH1("Verify Your Email")}
    ${emailP(`Hi ${escapeHtml(userName)},`)}
    ${emailP("Welcome to WWJMRD! Please verify your email address to get started with publishing your research articles.")}
    ${emailButton(escapeHtml(verifyUrl), "Verify Email Address")}
    ${emailP("Or copy and paste this link into your browser:")}
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; word-break:break-all; margin:8px 0;"><a href="${escapeHtml(verifyUrl)}" style="color:#00d4ff; text-decoration:underline;">${escapeHtml(verifyUrl)}</a></p>
    ${emailDivider()}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">What you can do with WWJMRD:</p>
        ${emailFeatureItem("📝 Submit research articles for publication")}
        ${emailFeatureItem("📊 Track your submission status")}
        ${emailFeatureItem("🏆 Receive publication certificates")}
        ${emailFeatureItem("👥 Manage co-authors")}
      </td></tr>
    </table>
    ${emailDivider()}
    ${emailFooterText("This link will expire in 24 hours. If you didn't create an account with WWJMRD, you can safely ignore this email.")}
  `;
  return wrapEmail("Verify Your Email", body);
};

const getWelcomeTemplate = (loginUrl: string, userName: string = "there"): string => {
  const body = `
    ${emailH1("Welcome to WWJMRD! 🎉")}
    ${emailP(`Hi ${escapeHtml(userName)},`)}
    ${emailP("Congratulations! Your email has been verified and your WWJMRD account is now active. You're ready to start submitting your research articles for publication.")}
    ${emailButton(escapeHtml(loginUrl), "Go to Dashboard")}
    ${emailDivider()}
    ${emailFooterText("If you have any questions, don't hesitate to reach out to our support team at support@wwjmrd.com.")}
  `;
  return wrapEmail("Welcome to WWJMRD", body);
};

const getArticleSubmissionTemplate = (data: EmailRequest["data"], isAdmin: boolean = false): string => {
  const infoRows = [
    emailInfoRow("Reference Number", escapeHtml(data?.referenceNumber || "N/A")),
    emailInfoRow("Title", escapeHtml(data?.articleTitle || "N/A")),
    emailInfoRow("Author", escapeHtml(data?.authorName || "N/A")),
    emailInfoRow("Email", escapeHtml(data?.authorEmail || "N/A")),
    emailInfoRow("Submission Date", escapeHtml(data?.submissionDate || new Date().toLocaleDateString())),
  ];
  if (data?.coAuthors && data.coAuthors.length > 0) {
    infoRows.push(emailInfoRow("Co-Authors", data.coAuthors.map((name) => escapeHtml(name)).join(", ")));
  }

  const body = `
    ${emailH1(isAdmin ? "New Article Submitted 📄" : "Article Submitted Successfully 📄")}
    ${emailP(isAdmin ? "A new article has been submitted for review." : `Hi ${escapeHtml(data?.authorName || "Author")},`)}
    ${isAdmin ? "" : emailP("Thank you for submitting your article to WWJMRD. Your submission has been received and is now under review.")}
    ${emailInfoBox("Submission Details:", infoRows.join(""))}
    ${
      isAdmin
        ? emailButton("https://wwjmrdai.online/admin/articles", "Review Article")
        : `
      ${emailP("What happens next:")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
        <tr><td style="padding:20px;">
          ${emailFeatureItem("1️⃣ Your article will be reviewed by our editorial team")}
          ${emailFeatureItem("2️⃣ You'll receive feedback and status updates via email")}
          ${emailFeatureItem("3️⃣ Once approved, you can complete the publication fee")}
          ${emailFeatureItem("4️⃣ After payment, you'll receive your publication certificate")}
        </td></tr>
      </table>
      ${emailP('<strong style="color:#ffffff;">📝 Important:</strong> Please download and submit the Copyright Transfer Form as soon as possible.')}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:10px 0 20px;">
        <tr>
          <td align="center">
            <a href="https://wwjmrdai.online/copyright-form.doc" download style="display:inline-block; background-color:#1a2340; color:#00d4ff; padding:10px 20px; border-radius:6px; text-decoration:none; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; font-weight:600; border:1px solid rgba(0,212,255,0.3);">📥 Download Copyright Form</a>
          </td>
        </tr>
      </table>
      ${emailButton("https://wwjmrdai.online/author/articles", "Track Your Article")}
    `
    }
    ${emailDivider()}
${emailFooterText("If you have any questions, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail(isAdmin ? "New Article Submitted" : "Article Submitted Successfully", body);
};

const getPaymentConfirmationTemplate = (data: EmailRequest["data"], isAdmin: boolean = false): string => {
  const currencySymbol = data?.currency === "INR" ? "₹" : "$";
  const finalAmt = data?.finalAmount?.toFixed(2) || data?.amount?.toFixed(2) || "0.00";

  let discountRow = "";
  if (data?.discountCode) {
    discountRow = emailInfoRow(
      `Discount (${escapeHtml(data.discountCode)})`,
      `-${currencySymbol}${data?.discountAmount?.toFixed(2) || "0.00"}`,
    );
  }

  const body = `
    ${emailH1(isAdmin ? "Payment Received ✅" : "Payment Successful ✅")}
    <!-- Invoice header -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0d2233" style="background-color:rgba(0,212,255,0.08); border-radius:8px; margin:0 0 24px;">
      <tr><td align="center" style="padding:20px;">
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#00d4ff; margin:0;">Invoice #${escapeHtml(data?.paymentId || "N/A")}</p>
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:36px; font-weight:700; color:#ffffff; margin:8px 0;">${currencySymbol}${finalAmt}</p>
        <span style="display:inline-block; background-color:#10b981; color:#ffffff; padding:4px 12px; border-radius:20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:12px; font-weight:600;">PAID</span>
      </td></tr>
    </table>
    ${emailP(isAdmin ? `Payment received from ${escapeHtml(data?.authorName || "Author")} (${escapeHtml(data?.authorEmail || "N/A")}).` : `Hi ${escapeHtml(data?.authorName || "Author")},`)}
    ${isAdmin ? "" : emailP("Thank you for your payment! Your publication fee has been processed successfully.")}
    ${emailInfoBox(
      "Payment Details:",
      [
        emailInfoRow("Transaction ID", escapeHtml(data?.transactionId || "N/A")),
        emailInfoRow("Payment Date", escapeHtml(data?.paymentDate || new Date().toLocaleDateString())),
        emailInfoRow("Original Amount", `${currencySymbol}${data?.amount?.toFixed(2) || "0.00"}`),
        discountRow,
        emailInfoRow("Total Paid", `${currencySymbol}${finalAmt}`, " color:#10b981; font-weight:700;"),
      ].join(""),
    )}
    ${
      data?.articleTitles && data.articleTitles.length > 0
        ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:16px 0;">
      <tr><td style="padding:16px;">
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">Articles:</p>
        ${data.articleTitles.map((title) => `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#d1d5db; padding:8px 0; margin:0; border-bottom:1px solid rgba(255,255,255,0.05);">📄 ${escapeHtml(title)}</p>`).join("")}
      </td></tr>
    </table>
    `
        : ""
    }
    ${
      isAdmin
        ? emailButton("https://wwjmrdai.online/admin/articles", "View Articles")
        : `
      ${emailP("What happens next:")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
        <tr><td style="padding:20px;">
          ${emailFeatureItem("✅ Your payment has been confirmed")}
          ${emailFeatureItem("📋 Your article will be processed for publication")}
          ${emailFeatureItem("📜 You'll receive your publication certificate soon")}
        </td></tr>
      </table>
      ${emailButton("https://wwjmrdai.online/author/certificates", "View Certificates")}
    `
    }
    ${emailDivider()}
    ${emailFooterText("This email serves as your payment receipt. For any queries, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail(isAdmin ? "Payment Received" : "Payment Successful", body);
};

const getReferralRewardTemplate = (data: EmailRequest["data"]): string => {
  const isReferrer = data?.rewardType === "referrer";
  const discountCode = data?.referralDiscountCode || "N/A";
  const discountAmount = data?.referralDiscountAmount || 10;

  const body = `
    ${emailH1(isReferrer ? "Referral Reward Earned! 🎉" : "Congratulations on Your Publication! 🎉")}
    ${emailP(`Hi ${escapeHtml(isReferrer ? data?.referrerName || "Author" : data?.referredName || "Author")},`)}
    ${
      isReferrer
        ? `
      ${emailP(`Great news! Your referred author <strong style="color:#ffffff;">${escapeHtml(data?.referredName || "an author")}</strong> just got their article published on WWJMRD.`)}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1f1535" style="background-color:rgba(168,85,247,0.12); border-radius:8px; margin:20px 0;">
        <tr><td align="center" style="padding:20px;">
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#a855f7; margin:0;">YOUR DISCOUNT CODE</p>
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:32px; font-weight:700; color:#a855f7; margin:8px 0; letter-spacing:0.15em;">${escapeHtml(discountCode)}</p>
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:24px; font-weight:700; color:#ffffff; margin:4px 0;">$${discountAmount} OFF</p>
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#d1d5db; margin:4px 0 0;">on your next publication fee</p>
        </td></tr>
      </table>
      ${emailP("Use this code at checkout when paying your next publication fee. The discount will be applied automatically.")}
    `
        : `
      ${emailP(`Your article <strong style="color:#ffffff;">"${escapeHtml(data?.articleTitle || "")}"</strong> has been published on WWJMRD!`)}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0d2233" style="background-color:rgba(0,212,255,0.08); border-radius:8px; margin:20px 0;">
        <tr><td align="center" style="padding:20px;">
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#00d4ff; margin:0;">YOUR WELCOME DISCOUNT</p>
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:32px; font-weight:700; color:#00d4ff; margin:8px 0; letter-spacing:0.15em;">${escapeHtml(discountCode)}</p>
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:24px; font-weight:700; color:#ffffff; margin:4px 0;">$10 OFF</p>
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#d1d5db; margin:4px 0 0;">on your next publication fee</p>
        </td></tr>
      </table>
      ${emailP(`Thanks to your publication, the author who referred you (<strong style="color:#ffffff;">${escapeHtml(data?.referrerName || "your referrer")}</strong>) has also earned a discount reward.`)}
    `
    }
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">Referral Reward Tiers:</p>
        ${emailFeatureItem('🥉 1 successful referral → <strong style="color:#ffffff;">$10 discount</strong>')}
        ${emailFeatureItem('🥈 2 successful referrals → <strong style="color:#ffffff;">$30 discount</strong>')}
        ${emailFeatureItem('🥇 3 successful referrals → <strong style="color:#ffffff;">$50 discount</strong>')}
      </td></tr>
    </table>
    ${emailButton("https://wwjmrdai.online/author/rewards", isReferrer ? "View Your Rewards" : "View Your Referral Code")}
    ${emailDivider()}
    ${emailFooterText("Discount codes are valid for 1 year and can be used once. For any questions, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail(isReferrer ? "Referral Reward Earned!" : "Congratulations on Your Publication!", body);
};

const getStatusInfo = (status: string): { emoji: string; title: string; message: string; color: string } => {
  switch (status) {
    case "under_review":
      return {
        emoji: "🔍",
        title: "Article Under Review",
        message:
          "Your article is now being reviewed by our editorial team. We will notify you once the review is complete.",
        color: "#eab308",
      };
    case "manuscript_accepted":
      return {
        emoji: "✅",
        title: "Manuscript Accepted",
        message:
          "Congratulations! Your manuscript has been accepted for publication. Please complete the publication fee payment to proceed.",
        color: "#10b981",
      };
    case "pending_fee":
      return {
        emoji: "💳",
        title: "Publication Fee Required",
        message:
          "Great news! Your article has been reviewed and accepted. Please complete the publication fee payment to proceed with publishing.",
        color: "#f97316",
      };
    case "rejected":
      return {
        emoji: "❌",
        title: "Article Not Accepted",
        message:
          "Unfortunately, your article did not meet our publication criteria due to a low score in the review report. Please download your review report from your dashboard, review the feedback carefully, revise your manuscript accordingly, and resubmit it for consideration.",
        color: "#ef4444",
      };
    default:
      return {
        emoji: "ℹ️",
        title: "Article Status Updated",
        message: `Your article status has been updated to: ${status.replace(/_/g, " ")}.`,
        color: "#00d4ff",
      };
  }
};

const getArticleStatusChangeTemplate = (data: EmailRequest["data"]): string => {
  const info = getStatusInfo(data?.status || "");
  const isManuscriptAccepted = data?.status === "manuscript_accepted";
  const isPendingFee = data?.status === "pending_fee";
  const isRejected = data?.status === "rejected";
  const statusDisplay = (data?.status || "").replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());

  const body = `
    ${emailH1(`${info.emoji} ${info.title}`)}
    ${emailP(`Hi ${escapeHtml(data?.authorName || "Author")},`)}
    ${emailP(info.message)}
    ${emailInfoBox(
      "Article Details:",
      [
        emailInfoRow("Reference Number", escapeHtml(data?.referenceNumber || "N/A")),
        emailInfoRow("Title", escapeHtml(data?.articleTitle || "N/A")),
        emailInfoRow("Status", statusDisplay, ` color:${info.color}; font-weight:600;`),
      ].join(""),
    )}
    ${isRejected ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
        <tr><td style="padding:20px;">
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">Next Steps:</p>
          ${emailFeatureItem('1️⃣ Log in to your dashboard and download your review report')}
          ${emailFeatureItem('2️⃣ Review the detailed feedback and scores')}
          ${emailFeatureItem('3️⃣ Revise your manuscript based on the recommendations')}
          ${emailFeatureItem('4️⃣ Resubmit your revised article for reconsideration')}
        </td></tr>
      </table>
      ${emailButton("https://wwjmrdai.online/author/articles", "Download Review Report & Revise")}
    ` : isPendingFee || isManuscriptAccepted
        ? emailP("Please log in to your dashboard to complete the payment and proceed with publication.") +
          emailButton("https://wwjmrdai.online/author/articles", "Pay Publication Fee")
        : emailButton("https://wwjmrdai.online/author/articles", "View My Articles")
    }
    ${emailDivider()}
    ${emailFooterText("If you have any questions about this update, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail(info.title, body);
};

const getReviewReportReadyTemplate = (data: EmailRequest["data"]): string => {
  const overallScore = (data as any)?.overallScore ?? 0;
  const isLowScore = (data as any)?.isLowScore === true || overallScore < 90;

  const infoRows = [
    emailInfoRow("Reference Number", escapeHtml(data?.referenceNumber || "N/A")),
    emailInfoRow("Title", escapeHtml(data?.articleTitle || "N/A")),
    emailInfoRow("Overall Score", `${overallScore}%`, overallScore < 90 ? " color:#ef4444; font-weight:600;" : " color:#10b981; font-weight:600;"),
    emailInfoRow("Recommendation", escapeHtml(((data as any)?.recommendation || "N/A").replace(/_/g, " "))),
  ].join("");

  const body = `
    ${emailH1(isLowScore ? "Review Report Ready — Revision Recommended 📝" : "Review Report Ready 📊")}
    ${emailP(`Dear ${escapeHtml(data?.authorName || "Author")},`)}
    ${emailP(`The review report for your article has been generated and is now available for download in your dashboard.`)}
    ${emailInfoBox("Review Summary", infoRows)}
    ${isLowScore ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#2d1a1a" style="background-color:#2d1a1a; border-radius:8px; margin:20px 0; border:1px solid rgba(239,68,60,0.3);">
        <tr><td style="padding:20px;">
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ef4444; margin:0 0 12px;">⚠️ Revision Recommended</p>
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#d1d5db; line-height:22px; margin:0 0 8px;">Your article scored <strong style="color:#ef4444;">${overallScore}%</strong>, which is below the 90% threshold. We strongly recommend you:</p>
          ${emailFeatureItem('1️⃣ Download your review report from your dashboard')}
          ${emailFeatureItem('2️⃣ Carefully review all feedback and suggestions')}
          ${emailFeatureItem('3️⃣ Revise your manuscript addressing the identified issues')}
          ${emailFeatureItem('4️⃣ Resubmit your revised article for reconsideration')}
        </td></tr>
      </table>
      ${emailButton("https://wwjmrdai.online/author/articles", "Download Report & Revise Article")}
    ` : `
      ${emailP("Log in to your dashboard to view the full review report and download it.")}
      ${emailButton("https://wwjmrdai.online/author/articles", "View Review Report")}
    `}
    ${emailDivider()}
    ${emailFooterText("This is an automated notification from WWJMRD. If you have questions about the review, please contact us at support@wwjmrd.com.")}
  `;
  return wrapEmail(isLowScore ? "Revision Recommended - Review Report" : "Review Report Ready", body);
};
const getPaymentReminderTemplate = (data: EmailRequest["data"]): string => {
  const d = (data || {}) as any;
  const level = Number(d.urgencyLevel) || 1;
  const urgencyMeta: Record<number, { label: string; color: string; emoji: string; intro: string }> = {
    1: { label: "Informational", color: "#3b82f6", emoji: "ℹ️", intro: "This is a gentle informational reminder that the publication fee for your article is still pending." },
    2: { label: "Moderate", color: "#f59e0b", emoji: "⏰", intro: "Your publication fee is still outstanding. Please complete the payment soon to keep your article on track." },
    3: { label: "High", color: "#ef4444", emoji: "🚨", intro: "Urgent: your publication fee remains unpaid. Immediate action is required to avoid delays or removal from the publishing queue." },
  };
  const meta = urgencyMeta[level] || urgencyMeta[1];
  const deadlineRow = d.deadline
    ? emailInfoRow("Last Fee Submission Date", escapeHtml(String(d.deadline)), " color:#ef4444; font-weight:600;")
    : "";
  const daysRow = typeof d.daysSinceAcceptance === "number"
    ? emailInfoRow("Days Since Acceptance", String(d.daysSinceAcceptance))
    : "";
  const deadlineWarn = (typeof d.daysUntilDeadline === "number")
    ? (d.daysUntilDeadline < 0
        ? emailP(`<strong style="color:#ef4444;">The fee submission deadline has passed by ${Math.abs(d.daysUntilDeadline)} day(s).</strong>`)
        : emailP(`<strong style="color:${meta.color};">Only ${d.daysUntilDeadline} day(s) left until the fee submission deadline.</strong>`))
    : "";

  const body = `
    ${emailH1(`${meta.emoji} Payment Reminder — ${meta.label} Urgency`)}
    ${emailP(`Hi ${escapeHtml(d.authorName || "Author")},`)}
    ${emailP(meta.intro)}
    ${d.extraMessage ? emailP(escapeHtml(String(d.extraMessage))) : ""}
    ${emailInfoBox(
      "Article Details:",
      [
        emailInfoRow("Reference Number", escapeHtml(d.referenceNumber || "N/A")),
        emailInfoRow("Title", escapeHtml(d.articleTitle || "N/A")),
        emailInfoRow("Status", "Pending Fee", " color:#f97316; font-weight:600;"),
        emailInfoRow("Urgency", meta.label, ` color:${meta.color}; font-weight:700;`),
        daysRow,
        deadlineRow,
      ].join(""),
    )}
    ${deadlineWarn}
    ${emailP("Please log in to your dashboard and complete the payment at your earliest convenience to avoid any delays in publishing your article.")}
    ${emailButton("https://wwjmrdai.online/author/cart", "Pay Publication Fee Now")}
    ${emailDivider()}
    ${emailFooterText("If you've already made the payment, please disregard this email. For any queries, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail(`Payment Reminder (${meta.label}) - WWJMRD`, body);
};

const getArticleResubmissionTemplate = (data: EmailRequest["data"], isAdmin: boolean = false): string => {
  const infoRows = [
    emailInfoRow("Reference Number", escapeHtml(data?.referenceNumber || "N/A")),
    emailInfoRow("Title", escapeHtml(data?.articleTitle || "N/A")),
    emailInfoRow("Author", escapeHtml(data?.authorName || "N/A")),
    emailInfoRow("Resubmission Date", escapeHtml(data?.submissionDate || new Date().toLocaleDateString())),
  ].join("");

  const body = `
    ${emailH1(isAdmin ? "Article Resubmitted 🔄" : "Article Resubmitted Successfully 🔄")}
    ${emailP(isAdmin ? `Author ${escapeHtml(data?.authorName || "Author")} has resubmitted a revised article.` : `Hi ${escapeHtml(data?.authorName || "Author")},`)}
    ${isAdmin ? "" : emailP("Your revised article has been resubmitted and is now under review again.")}
    ${emailInfoBox("Resubmission Details:", infoRows)}
    ${isAdmin
      ? emailButton("https://wwjmrdai.online/admin/articles", "Review Article")
      : emailButton("https://wwjmrdai.online/author/articles", "Track Your Article")
    }
    ${emailDivider()}
    ${emailFooterText("If you have any questions, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail(isAdmin ? "Article Resubmitted" : "Article Resubmitted Successfully", body);
};

const getGalleyProofReviewTemplate = (data: EmailRequest["data"]): string => {
  const deadline = escapeHtml((data as any)?.deadline || "N/A");
  const wordUrl = (data as any)?.wordDownloadUrl || "#";
  const pdfUrl = (data as any)?.pdfDownloadUrl || "#";

  const body = `
    ${emailH1("Galley Proof Ready for Review 📄")}
    ${emailP(`Dear ${escapeHtml(data?.authorName || "Author")},`)}
    ${emailP(`Your galley proof for the article <strong style="color:#ffffff;">"${escapeHtml(data?.articleTitle || "")}"</strong> (Ref: ${escapeHtml(data?.referenceNumber || "N/A")}) is ready for your review.`)}
    
    ${emailInfoBox("Review Instructions:", [
      emailInfoRow("Deadline", deadline, " color:#f97316; font-weight:600;"),
      emailInfoRow("Reference", escapeHtml(data?.referenceNumber || "N/A")),
    ].join(""))}
    
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">What you need to do:</p>
        ${emailFeatureItem('1️⃣ Download and review the PDF below')}
        ${emailFeatureItem('2️⃣ Open your dashboard to edit the same formatted article if corrections are needed')}
        ${emailFeatureItem('3️⃣ Highlight every correction in <strong style="color:#ef4444;">RED</strong> in the editor and send it back to admin')}
        ${emailFeatureItem('4️⃣ If everything looks good: click "Approve Galley Proof" in your dashboard for final processing')}
      </td></tr>
    </table>
    
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;">
      <tr>
        <td align="center" style="padding:0 4px;">
          <a href="${escapeHtml(pdfUrl)}" target="_blank" style="display:inline-block; background-color:#dc2626; color:#ffffff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; font-weight:600; text-decoration:none; padding:12px 24px; border-radius:8px;">📥 Download PDF File</a>
        </td>
      </tr>
    </table>
    
    ${emailButton("https://wwjmrdai.online/author/articles", "Review in Dashboard")}
    
    ${emailDivider()}
    ${emailFooterText(`⏰ Please respond by ${deadline}. You can still submit after the deadline, but timely responses help us publish faster.`)}
    ${emailFooterText("For any questions, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail("Galley Proof Ready for Review", body);
};

const getCopyrightFormRequestTemplate = (data: EmailRequest["data"]): string => {
  const body = `
    ${emailH1("Copyright Form Required 📝")}
    ${emailP(`Dear ${escapeHtml(data?.authorName || "Author")},`)}
    ${emailP(`Thank you for submitting your article <strong style="color:#ffffff;">"${escapeHtml(data?.articleTitle || "")}"</strong> (Ref: ${escapeHtml(data?.referenceNumber || "N/A")}) to WWJMRD.`)}
    ${emailP("To proceed with the publication process, we require you to submit a signed <strong style='color:#ffffff;'>Copyright Transfer Form</strong>.")}
    
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">How to submit:</p>
        ${emailFeatureItem('1️⃣ Download and fill out the copyright form')}
        ${emailFeatureItem('2️⃣ Sign the form and save it as a PDF')}
        ${emailFeatureItem('3️⃣ Upload the signed PDF from your dashboard')}
      </td></tr>
    </table>
    
    ${emailButton("https://wwjmrdai.online/author/articles", "Submit Copyright Form")}
    ${emailDivider()}
    ${emailFooterText("If you have any questions about the copyright form, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail("Copyright Form Required - WWJMRD", body);
};

const getUpgradeToProTemplate = (data: EmailRequest["data"]): string => {
  const body = `
    ${emailH1("Upgrade to Pro Plan 🚀")}
    ${emailP(`Hi ${escapeHtml(data?.authorName || "Author")},`)}
    ${emailP("You've used all <strong style='color:#ffffff;'>2 free review report downloads</strong> available on the Free plan. Upgrade to the Pro plan to unlock more benefits!")}
    
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">Pro Plan Benefits:</p>
        ${emailFeatureItem('📊 <strong style="color:#ffffff;">5 review report downloads</strong> per month')}
        ${emailFeatureItem('👥 <strong style="color:#ffffff;">4 co-author certificates</strong> per month')}
        ${emailFeatureItem('🔄 Monthly limit resets automatically')}
        ${emailFeatureItem('⚡ Priority support and features')}
      </td></tr>
    </table>
    
    ${emailButton("https://wwjmrdai.online/author/subscription", "Upgrade to Pro")}
    ${emailDivider()}
    ${emailFooterText("If you have any questions about the Pro plan, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail("Upgrade to Pro - WWJMRD", body);
};

const getManuscriptReviseTemplate = (data: EmailRequest["data"]): string => {
  const body = `
    ${emailH1("Manuscript Revision Required ✏️")}
    ${emailP(`Hi ${escapeHtml(data?.authorName || "Author")},`)}
    ${emailP(`Your article <strong style="color:#ffffff;">"${escapeHtml(data?.articleTitle || "")}"</strong> (Ref: ${escapeHtml(data?.referenceNumber || "N/A")}) requires revision before it can be accepted for publication.`)}
    ${emailP(`Your article has <strong style="color:#ffffff;">${escapeHtml(String((data as any)?.pageCount || "N/A"))} pages</strong>. Please review the feedback in your review report, revise your manuscript accordingly, and resubmit it through your author dashboard.`)}
    ${emailP("To improve your chances of acceptance:")}
    
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
      <tr><td style="padding:20px;">
        ${emailFeatureItem('📊 Download your review report for detailed feedback')}
        ${emailFeatureItem('✏️ Address all highlighted issues in the report')}
        ${emailFeatureItem('📄 Resubmit the revised manuscript from your dashboard')}
        ${emailFeatureItem('🔍 Ensure your article meets quality standards')}
      </td></tr>
    </table>
    
    ${emailButton("https://wwjmrdai.online/author/articles", "Go to My Articles")}
    ${emailDivider()}
    ${emailFooterText("If you have any questions, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail("Manuscript Revision Required - WWJMRD", body);
};

const getManuscriptUpdateTemplate = (data: EmailRequest["data"], isAdmin: boolean = false): string => {
  const infoRows = [
    emailInfoRow("Reference Number", escapeHtml(data?.referenceNumber || "N/A")),
    emailInfoRow("Title", escapeHtml(data?.articleTitle || "N/A")),
    emailInfoRow("Author", escapeHtml(data?.authorName || "N/A")),
    emailInfoRow("Updated On", escapeHtml(data?.submissionDate || new Date().toLocaleDateString())),
  ].join("");

  const body = `
    ${emailH1(isAdmin ? "Manuscript Updated 📝" : "Manuscript Updated Successfully 📝")}
    ${emailP(isAdmin ? `Author ${escapeHtml(data?.authorName || "Author")} has uploaded an updated manuscript for review.` : `Hi ${escapeHtml(data?.authorName || "Author")},`)}
    ${isAdmin ? "" : emailP("Your updated manuscript has been uploaded successfully. The admin will review the updated document.")}
    ${emailInfoBox("Update Details:", infoRows)}
    ${isAdmin
      ? emailButton("https://wwjmrdai.online/admin/articles", "Review Updated Manuscript")
      : emailButton("https://wwjmrdai.online/author/articles", "Track Your Article")
    }
    ${emailDivider()}
    ${emailFooterText("If you have any questions, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail(isAdmin ? "Manuscript Updated" : "Manuscript Updated Successfully", body);
};

const getGalleyProofRevisionTemplate = (data: EmailRequest["data"], isAdmin: boolean = false): string => {
  const infoRows = [
    emailInfoRow("Reference Number", escapeHtml(data?.referenceNumber || "N/A")),
    emailInfoRow("Title", escapeHtml(data?.articleTitle || "N/A")),
    emailInfoRow("Author", escapeHtml(data?.authorName || "N/A")),
    emailInfoRow("Submitted On", escapeHtml(data?.submissionDate || new Date().toLocaleDateString())),
  ].join("");

  const body = `
    ${emailH1(isAdmin ? "Galley Proof Revision Submitted 📝" : "Galley Proof Revision Submitted Successfully 📝")}
    ${emailP(isAdmin ? `Author ${escapeHtml(data?.authorName || "Author")} has submitted a revised galley proof.` : `Hi ${escapeHtml(data?.authorName || "Author")},`)}
    ${isAdmin ? "" : emailP("Your revised galley proof has been submitted successfully. The admin will review your revision.")}
    ${emailInfoBox("Revision Details:", infoRows)}
    ${isAdmin
      ? emailButton("https://wwjmrdai.online/admin/articles", "Review Galley Proof Revision")
      : emailButton("https://wwjmrdai.online/author/articles", "Track Your Article")
    }
    ${emailDivider()}
    ${emailFooterText("If you have any questions, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail(isAdmin ? "Galley Proof Revision Submitted" : "Galley Proof Revision Submitted Successfully", body);
};

const getGalleyProofApprovedTemplate = (data: EmailRequest["data"], isAdmin: boolean = false): string => {
  const infoRows = [
    emailInfoRow("Reference Number", escapeHtml(data?.referenceNumber || "N/A")),
    emailInfoRow("Title", escapeHtml(data?.articleTitle || "N/A")),
    emailInfoRow("Author", escapeHtml(data?.authorName || "N/A")),
    emailInfoRow("Approved On", escapeHtml(data?.submissionDate || new Date().toLocaleDateString())),
  ].join("");
  const body = `
    ${emailH1(isAdmin ? "Galley Proof Approved ✅" : "Galley Proof Approval Received ✅")}
    ${emailP(isAdmin ? `Author ${escapeHtml(data?.authorName || "Author")} has approved the galley proof. The article is ready for final processing.` : `Hi ${escapeHtml(data?.authorName || "Author")},`)}
    ${isAdmin ? "" : emailP("Thank you. Your approval has been received and the article has moved to final processing.")}
    ${emailInfoBox("Approval Details:", infoRows)}
    ${isAdmin ? emailButton("https://wwjmrdai.online/admin/publish-queue", "Open Publish Queue") : emailButton("https://wwjmrdai.online/author/articles", "Track Your Article")}
    ${emailDivider()}
    ${emailFooterText("If you have any questions, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail(isAdmin ? "Galley Proof Approved" : "Galley Proof Approval Received", body);
};
const getArticlePublishedTemplate = (data: EmailRequest["data"], isAdmin: boolean = false): string => {
  const volume = (data as any)?.volume || "N/A";
  const issue = (data as any)?.issue || "N/A";
  const pageNumber = (data as any)?.pageNumber || "N/A";
  const year = (data as any)?.year || new Date().getFullYear().toString();
  const publishedLink = (data as any)?.publishedLink || "";
  const certificateNumber = (data as any)?.certificateNumber || "N/A";

  const infoRows = [
    emailInfoRow("Reference Number", escapeHtml(data?.referenceNumber || "N/A")),
    emailInfoRow("Title", escapeHtml(data?.articleTitle || "N/A")),
    emailInfoRow("Author", escapeHtml(data?.authorName || "N/A")),
    emailInfoRow("Volume", escapeHtml(volume)),
    emailInfoRow("Issue", escapeHtml(issue)),
    emailInfoRow("Pages", escapeHtml(pageNumber)),
    emailInfoRow("Year", escapeHtml(year)),
    emailInfoRow("Certificate No.", escapeHtml(certificateNumber)),
  ].join("");

  if (isAdmin) {
    const body = `
      ${emailH1("Article Published & Certificate Generated 🎓")}
      ${emailP(`An article has been published and a certificate has been generated.`)}
      ${emailInfoBox("Publication Details:", infoRows)}
      ${publishedLink ? emailP(`Published Link: <a href="${escapeHtml(publishedLink)}" style="color:#00d4ff; text-decoration:underline;">${escapeHtml(publishedLink)}</a>`) : ""}
      ${emailButton("https://wwjmrdai.online/admin/articles", "View in Admin Panel")}
      ${emailDivider()}
      ${emailFooterText("This is an automated notification from WWJMRD.")}
    `;
    return wrapEmail("Article Published & Certificate Generated", body);
  }

  const body = `
    ${emailH1("🎉 Congratulations! Your Article is Published")}
    ${emailP(`Dear ${escapeHtml(data?.authorName || "Author")},`)}
    ${emailP(`We are delighted to inform you that your article has been <strong style="color:#10b981;">successfully published</strong> in the World Wide Journal of Multidisciplinary Research and Development (WWJMRD).`)}
    ${emailInfoBox("Publication Details:", infoRows)}
    ${publishedLink ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0d2233" style="background-color:rgba(0,212,255,0.08); border-radius:8px; margin:20px 0;">
        <tr><td align="center" style="padding:20px;">
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#00d4ff; margin:0;">VIEW YOUR PUBLISHED ARTICLE</p>
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; margin:8px 0;"><a href="${escapeHtml(publishedLink)}" style="color:#00d4ff; text-decoration:underline; word-break:break-all;">${escapeHtml(publishedLink)}</a></p>
        </td></tr>
      </table>
    ` : ""}
    ${emailP(`Your publication certificate has been generated and is available for download from your dashboard.`)}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">What's Next:</p>
        ${emailFeatureItem("📜 Download your publication certificate from your dashboard")}
        ${emailFeatureItem("🔗 Share your published article with your network")}
        ${emailFeatureItem("👥 Co-author certificates can be requested from your article page")}
        ${emailFeatureItem("🌟 Refer colleagues and earn discount rewards")}
      </td></tr>
    </table>
    ${emailButton("https://wwjmrdai.online/author/certificates", "Download Certificate")}
    ${emailDivider()}
    ${emailFooterText("Thank you for publishing with WWJMRD. For any questions, contact us at support@wwjmrd.com")}
  `;
  return wrapEmail("Your Article is Published! 🎉", body);
};

const getAdminCreatedCredentialsTemplate = (data: EmailRequest["data"]): string => {
  const userName = (data as any)?.userName || "there";
  const email = (data as any)?.authorEmail || "";
  const tempPassword = (data as any)?.tempPassword || "";
  const resetUrl = (data as any)?.resetUrl || "";
  const loginUrl = (data as any)?.loginUrl || "https://wwjmrdai.online/auth";
  const isTemp = (data as any)?.isGeneratedTemp !== false;
  const body = `
    ${emailH1("Your WWJMRD Account is Ready 🎉")}
    ${emailP(`Hi ${escapeHtml(userName)},`)}
    ${emailP("An admin at WWJMRD has just created an author account for you. Use the credentials below to sign in.")}
    ${emailInfoBox("Your sign-in details:", [
      emailInfoRow("Email", escapeHtml(email)),
      emailInfoRow(isTemp ? "Temporary password" : "Password", `<code style="font-family:monospace; color:#00d4ff;">${escapeHtml(tempPassword)}</code>`),
    ].join(""))}
    ${isTemp ? emailP(`<strong style="color:#f97316;">⚠️ Important:</strong> This is a temporary password. You will be asked to set your own password and verify your email address the first time you sign in.`) : ""}
    ${resetUrl ? emailButton(escapeHtml(resetUrl), "Set Your Password & Verify Email") : emailButton(escapeHtml(loginUrl), "Sign In")}
    ${emailP("Or sign in manually:")}
    <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; word-break:break-all; margin:8px 0;"><a href="${escapeHtml(loginUrl)}" style="color:#00d4ff; text-decoration:underline;">${escapeHtml(loginUrl)}</a></p>
    ${emailDivider()}
    ${emailFooterText("If you weren't expecting this email, please ignore it or contact support@wwjmrd.com.")}
  `;
  return wrapEmail("Your WWJMRD Account is Ready", body);
};

const getGalleyProofAuthorCorrectionsTemplate = (data: EmailRequest["data"], isAdmin: boolean): string => {
  const infoRows = [
    emailInfoRow("Reference Number", escapeHtml(data?.referenceNumber || "N/A")),
    emailInfoRow("Title", escapeHtml(data?.articleTitle || "N/A")),
    emailInfoRow("Author", escapeHtml(data?.authorName || "N/A")),
    emailInfoRow("Submitted", escapeHtml(data?.submissionDate || new Date().toLocaleDateString())),
  ].join("");

  const body = isAdmin ? `
    ${emailH1("Author Sent Galley Corrections 📝")}
    ${emailP(`Author ${escapeHtml(data?.authorName || "Author")} has reviewed the galley proof and sent corrections directly from the editor. Red-highlighted edits are visible in the editor.`)}
    ${emailInfoBox("Article:", infoRows)}
    ${emailButton("https://wwjmrdai.online/admin/formatting", "Open in Formatting")}
    ${emailDivider()}
    ${emailFooterText("Review the highlighted corrections, clean up the highlights, and regenerate the PDF.")}
  ` : `
    ${emailH1("Corrections Sent to Admin ✅")}
    ${emailP(`Hi ${escapeHtml(data?.authorName || "Author")},`)}
    ${emailP("Your corrections have been received. Our editorial team will review the highlighted changes and follow up shortly.")}
    ${emailInfoBox("Submission:", infoRows)}
    ${emailButton("https://wwjmrdai.online/author/articles", "View My Articles")}
    ${emailDivider()}
    ${emailFooterText("Thank you for your careful review.")}
  `;
  return wrapEmail(isAdmin ? "Author Sent Galley Corrections" : "Corrections Sent to Admin", body);
};



function getEmailContent(
  template: EmailTemplate,
  data?: EmailRequest["data"],
  isAdmin: boolean = false
): { subject: string; html: string } {
  switch (template) {
    case "password-reset":
      return {
        subject: "Reset Your Password - WWJMRD",
        html: getPasswordResetTemplate(data?.resetUrl || "", data?.userName),
      };
    case "email-verification":
      return {
        subject: "Verify Your Email - WWJMRD",
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
          ? `New Article Submitted: ${data?.articleTitle || "Untitled"}`
          : "Article Submitted Successfully - WWJMRD",
        html: getArticleSubmissionTemplate(data, isAdmin),
      };
    case "article-resubmission":
      return {
        subject: isAdmin
          ? `Article Resubmitted: ${data?.articleTitle || "Untitled"}`
          : "Article Resubmitted Successfully - WWJMRD",
        html: getArticleResubmissionTemplate(data, isAdmin),
      };
    case "payment-confirmation":
      return {
        subject: isAdmin
          ? `Payment Received from ${data?.authorName || "Author"}`
          : "Payment Successful - WWJMRD",
        html: getPaymentConfirmationTemplate(data, isAdmin),
      };
    case "referral-reward":
      return {
        subject: data?.rewardType === "referrer"
          ? "Referral Reward Earned! 🎉 - WWJMRD"
          : "Congratulations on Your Publication! 🎉 - WWJMRD",
        html: getReferralRewardTemplate(data),
      };
    case "article-status-change":
      return {
        subject: `Article Status Update: ${(data?.status || "").replace(/_/g, " ")} - WWJMRD`,
        html: getArticleStatusChangeTemplate(data),
      };
    case "review-report-ready":
      return {
        subject: `Review Report Ready: ${data?.articleTitle || "Your Article"} - WWJMRD`,
        html: getReviewReportReadyTemplate(data),
      };
    case "payment-reminder":
      return {
        subject: `Payment Reminder: ${data?.articleTitle || "Your Article"} - WWJMRD`,
        html: getPaymentReminderTemplate(data),
      };
    case "galley-proof-review":
      return {
        subject: `Galley Proof Ready: ${data?.articleTitle || "Your Article"} - WWJMRD`,
        html: getGalleyProofReviewTemplate(data),
      };
    case "copyright-form-request":
      return {
        subject: `Copyright Form Required: ${data?.articleTitle || "Your Article"} - WWJMRD`,
        html: getCopyrightFormRequestTemplate(data),
      };
    case "upgrade-to-pro":
      return {
        subject: "Upgrade to Pro Plan - Unlock More Benefits! 🚀 - WWJMRD",
        html: getUpgradeToProTemplate(data),
      };
    case "manuscript-revise":
      return {
        subject: `Manuscript Revision Required: ${data?.articleTitle || "Your Article"} - WWJMRD`,
        html: getManuscriptReviseTemplate(data),
      };
    case "manuscript-update":
      return {
        subject: isAdmin
          ? `Manuscript Updated: ${data?.articleTitle || "Untitled"}`
          : "Manuscript Updated Successfully - WWJMRD",
        html: getManuscriptUpdateTemplate(data, isAdmin),
      };
    case "galley-proof-revision":
      return {
        subject: isAdmin
          ? `Galley Proof Revision: ${data?.articleTitle || "Untitled"}`
          : "Galley Proof Revision Submitted - WWJMRD",
        html: getGalleyProofRevisionTemplate(data, isAdmin),
      };
    case "galley-proof-approved":
      return {
        subject: isAdmin
          ? `Galley Proof Approved: ${data?.articleTitle || "Untitled"}`
          : "Galley Proof Approval Received - WWJMRD",
        html: getGalleyProofApprovedTemplate(data, isAdmin),
      };
    case "article-published":
      return {
        subject: isAdmin
          ? `Article Published: ${data?.articleTitle || "Untitled"} - Certificate Generated`
          : `🎉 Your Article is Published! ${data?.referenceNumber ? `(${data.referenceNumber})` : ""} - WWJMRD`,
        html: getArticlePublishedTemplate(data, isAdmin),
      };
    case "admin-created-credentials":
      return {
        subject: "Your WWJMRD account is ready 🎉",
        html: getAdminCreatedCredentialsTemplate(data),
      };
    case "galley-proof-author-corrections":
      return {
        subject: isAdmin
          ? `Author Corrections Received: ${data?.articleTitle || "Untitled"}`
          : "Your galley-proof corrections have been received - WWJMRD",
        html: getGalleyProofAuthorCorrectionsTemplate(data, isAdmin),
      };
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

// ============================================================================
// Multi-provider email sending
// ============================================================================
type SendArgs = { from: string; to: string; subject: string; html: string };

async function sendViaResend(args: SendArgs) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY not configured");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: args.from, to: [args.to], subject: args.subject, html: args.html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return await r.json();
}

async function sendViaSendgrid(args: SendArgs) {
  const key = Deno.env.get("SENDGRID_API_KEY");
  if (!key) throw new Error("SENDGRID_API_KEY not configured");
  // Parse "Name <email>" form
  const m = args.from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const fromEmail = m ? m[2] : args.from;
  const fromName = m ? m[1] : undefined;
  const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: args.to }] }],
      from: fromName ? { email: fromEmail, name: fromName } : { email: fromEmail },
      subject: args.subject,
      content: [{ type: "text/html", value: args.html }],
    }),
  });
  if (!r.ok) throw new Error(`SendGrid ${r.status}: ${await r.text()}`);
  return { provider: "sendgrid", status: r.status };
}

async function sendViaMailgun(args: SendArgs) {
  const key = Deno.env.get("MAILGUN_API_KEY");
  if (!key) throw new Error("MAILGUN_API_KEY not configured");
  // Domain is read from admin_settings.mailgun_domain (passed via env fallback)
  const domain = Deno.env.get("MAILGUN_DOMAIN") || "";
  if (!domain) throw new Error("MAILGUN_DOMAIN not configured");
  const form = new URLSearchParams();
  form.set("from", args.from);
  form.set("to", args.to);
  form.set("subject", args.subject);
  form.set("html", args.html);
  const r = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`api:${key}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!r.ok) throw new Error(`Mailgun ${r.status}: ${await r.text()}`);
  return await r.json();
}

// SES creds may come from admin_settings (preferred) or env fallback.
let cachedSesCreds: { accessKey: string; secretKey: string; region: string } | null = null;
async function getSesCreds() {
  if (cachedSesCreds) return cachedSesCreds;
  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data } = await sb.from("admin_settings").select("setting_key, setting_value")
    .in("setting_key", ["aws_access_key_id", "aws_secret_access_key", "aws_ses_region"]);
  const map: Record<string, string> = {};
  (data ?? []).forEach((r: any) => (map[r.setting_key] = r.setting_value ?? ""));
  cachedSesCreds = {
    accessKey: (map.aws_access_key_id || Deno.env.get("AWS_ACCESS_KEY_ID") || "").trim(),
    secretKey: (map.aws_secret_access_key || Deno.env.get("AWS_SECRET_ACCESS_KEY") || "").trim(),
    region: (map.aws_ses_region || Deno.env.get("AWS_SES_REGION") || "us-east-1").trim(),
  };
  return cachedSesCreds;
}

// Minimal SigV4-signed AWS SES SendEmail call
async function sendViaSes(args: SendArgs) {
  const { accessKey, secretKey, region } = await getSesCreds();
  if (!accessKey || !secretKey) throw new Error("AWS SES credentials not configured");

  const service = "ses";
  const host = `email.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;

  const params = new URLSearchParams();
  params.set("Action", "SendEmail");
  params.set("Source", args.from);
  params.set("Destination.ToAddresses.member.1", args.to);
  params.set("Message.Subject.Data", args.subject);
  params.set("Message.Body.Html.Data", args.html);
  const payload = params.toString();

  const enc = new TextEncoder();
  const sha256 = async (data: Uint8Array | string) => {
    const buf = typeof data === "string" ? enc.encode(data) : data;
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  const hmac = async (key: ArrayBuffer | Uint8Array, msg: string) => {
    const k = await crypto.subtle.importKey("raw", key as any, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
  };

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256(payload);
  const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256(canonicalRequest)}`;
  const kDate = await hmac(enc.encode("AWS4" + secretKey), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const sigBytes = await hmac(kSigning, stringToSign);
  const signature = Array.from(sigBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const authHeader = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Amz-Date": amzDate,
      "Authorization": authHeader,
      "Host": host,
    },
    body: payload,
  });
  if (!r.ok) throw new Error(`SES ${r.status}: ${await r.text()}`);
  return { provider: "aws-ses", status: r.status };
}

interface ProviderEntry {
  provider: string;
  from: string;
  mailgunDomain?: string;
}

async function loadProviderChain(): Promise<{ primary: ProviderEntry; chain: ProviderEntry[]; defaultFrom: string }> {
  const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data } = await sb.from("admin_settings").select("setting_key, setting_value")
    .in("setting_key", ["email_provider", "email_from_address", "mailgun_domain", "email_backup_chain"]);
  const map: Record<string, string> = {};
  (data ?? []).forEach((r: any) => (map[r.setting_key] = r.setting_value ?? ""));
  const defaultFrom = map.email_from_address || "WWJMRD <noreply@wwjmrdai.online>";
  const primary: ProviderEntry = {
    provider: map.email_provider || "resend",
    from: defaultFrom,
    mailgunDomain: map.mailgun_domain || undefined,
  };
  const chain: ProviderEntry[] = [];
  if (map.email_backup_chain) {
    try {
      const arr = JSON.parse(map.email_backup_chain);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (item?.provider) {
            chain.push({
              provider: String(item.provider),
              from: item.from || defaultFrom,
              mailgunDomain: item.mailgun_domain || undefined,
            });
          }
        }
      }
    } catch (_) { /* ignore */ }
  }
  return { primary, chain, defaultFrom };
}

async function sendViaOne(entry: ProviderEntry, args: SendArgs) {
  if (entry.mailgunDomain) {
    try { (Deno.env as any).set?.("MAILGUN_DOMAIN", entry.mailgunDomain); } catch (_) { /* ignore */ }
  }
  // AWS SES requires a verified sender identity. Force the verified noreply@wwjmrd.com address.
  const SES_VERIFIED_FROM = "WWJMRD <noreply@wwjmrd.com>";
  const finalArgs: SendArgs = {
    ...args,
    from: args.from || (entry.provider === "aws-ses" ? SES_VERIFIED_FROM : entry.from),
  };
  switch (entry.provider) {
    case "sendgrid": return await sendViaSendgrid(finalArgs);
    case "mailgun": return await sendViaMailgun(finalArgs);
    case "aws-ses": return await sendViaSes(finalArgs);
    case "resend":
    default: return await sendViaResend(finalArgs);
  }
}

async function sendViaActiveProvider(args: SendArgs & { providerOverride?: string }) {
  const { primary, chain, defaultFrom } = await loadProviderChain();
  // If override explicit, use ONLY that provider (no fallback).
  if (args.providerOverride) {
    const entry: ProviderEntry = { provider: args.providerOverride, from: args.from || defaultFrom };
    const result = await sendViaOne(entry, args);
    return { provider: entry.provider, result };
  }
  const tryOrder: ProviderEntry[] = [primary, ...chain];
  let lastErr: any = null;
  for (const entry of tryOrder) {
    try {
      const result = await sendViaOne(entry, args);
      if (entry !== primary) console.log(`Email fallback: sent via ${entry.provider} after primary failed`);
      return { provider: entry.provider, result };
    } catch (e: any) {
      lastErr = e;
      console.error(`Email provider ${entry.provider} failed:`, e?.message || e);
    }
  }
  throw lastErr ?? new Error("All email providers failed");
}


const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: EmailRequest & { isAdmin?: boolean; test?: boolean } = await req.json();

    // Authenticate the request FIRST - accept valid user JWT or service role key
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
    const isServiceRole = !!serviceRoleKey && token === serviceRoleKey;

    let callerUserId: string | null = null;
    let callerIsAdmin = false;

    if (!isServiceRole) {
      // Validate as user JWT using getUser
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
      callerUserId = userData.user.id;
      // Check admin role via service-role client to bypass RLS
      try {
        const admin = createClient(supabaseUrl, serviceRoleKey!);
        const { data: roleRow } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", callerUserId)
          .eq("role", "admin")
          .maybeSingle();
        callerIsAdmin = !!roleRow;
      } catch (_) { /* ignore */ }
      console.log("Email request authenticated for user:", callerUserId, "admin:", callerIsAdmin);
    } else {
      console.log("Email request authenticated via service role");
    }

    // Test mode is restricted to admins or service-role callers
    if (body.test === true) {
      if (!isServiceRole && !callerIsAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      console.log("Test mode: sending test email to admin");
      try {
        const testResult = await resend.emails.send({
          from: "WWJMRD <noreply@wwjmrdai.online>",
          to: ["shubhmeena23@gmail.com"],
          subject: "WWJMRD Test Email ✅",
          html: wrapEmail("Test Email", `
            ${emailH1("Email Delivery Test ✅")}
            ${emailP("This is a test email to verify that WWJMRD email delivery is working correctly.")}
            ${emailP("If you received this email, the Resend integration is functioning properly.")}
            ${emailP(`Sent at: ${new Date().toISOString()}`)}
          `),
        });
        return new Response(JSON.stringify({ success: true, result: testResult }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (testErr: any) {
        console.error("Test email failed:", testErr?.message);
        return new Response(JSON.stringify({ success: false, error: "Test failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    const { to, template, data, subject, html, from, isAdmin, providerOverride, fromOverride } = body as any;

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
      // Custom (free-form HTML) templates can be used to send phishing email
      // from our verified sender domain. Restrict to admins and service role only.
      if (!isServiceRole && !callerIsAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      if (!subject || !html) {
        throw new Error("Custom template requires subject and html fields");
      }
      emailSubject = subject;
      emailHtml = html;
    } else if (template) {
      // Check for admin-managed template override in DB
      let override: { subject: string; html: string } | null = null;
      try {
        const sbAdmin = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
        const { data: tplRow } = await sbAdmin
          .from("email_templates")
          .select("subject, html")
          .eq("template_key", template)
          .maybeSingle();
        if (tplRow?.subject && tplRow?.html) override = tplRow as any;
      } catch (_) { /* ignore */ }

      if (override) {
        const ctx = { ...(data || {}), isAdmin };
        const render = (s: string) => s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
          const v = (ctx as any)[k];
          return v === undefined || v === null ? "" : String(v);
        });
        emailSubject = render(override.subject);
        emailHtml = render(override.html);
      } else {
        const content = getEmailContent(template, data, isAdmin);
        emailSubject = content.subject;
        emailHtml = content.html;
      }
    } else {
      throw new Error("Missing required field: template");
    }

    console.log(`Sending ${template} email to: ${to}, subject: ${emailSubject}, isAdmin: ${isAdmin}, providerOverride: ${providerOverride || "(default)"}`);

    let emailResponse: any = null;
    let sendError: any = null;
    let providerUsed = "resend";
    try {
      const out = await sendViaActiveProvider({
        from: fromOverride || from || "",
        to,
        subject: emailSubject,
        html: emailHtml,
        providerOverride,
      });
      providerUsed = out.provider;
      emailResponse = out.result;
      console.log(`Email sent successfully via ${providerUsed}:`, JSON.stringify(emailResponse));
    } catch (err: any) {
      sendError = err;
      console.error(`Email send failed via ${providerOverride || "active provider"}:`, err?.message || err);
    }

    // Log every send attempt to email_log (best-effort, non-blocking failure)
    try {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const meta = (data || {}) as any;
      await supabaseAdmin.from("email_log").insert({
        recipient_email: to,
        recipient_name: meta.authorName || meta.userName || meta.referrerName || null,
        subject: emailSubject,
        template_name: template || "custom",
        email_type: isAdmin ? "admin_notification" : "transactional",
        status: sendError ? "failed" : "sent",
        error_message: sendError ? String(sendError?.message || sendError) : null,
        related_article_id: meta.articleId || null,
        metadata: {
          referenceNumber: meta.referenceNumber,
          articleTitle: meta.articleTitle,
          isAdmin: !!isAdmin,
        },
      });
    } catch (logErr) {
      console.error("email_log insert failed (non-fatal):", logErr);
    }

    if (sendError) {
      // Return 200 with success:false so admin tests can show provider misconfiguration
      // without surfacing as an unhandled Edge Function runtime error in the app.
      const detail = (sendError as any)?.message || String(sendError);
      const provider = providerOverride || providerUsed || undefined;
      return new Response(JSON.stringify({
        success: false,
        error: "Failed to send email.",
        provider,
        detail: callerIsAdmin || isServiceRole ? detail : undefined,
        guidance: callerIsAdmin || isServiceRole ? getEmailErrorGuidance(detail, provider) : undefined,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-email function:", error);
    return new Response(JSON.stringify({ error: "Failed to send email. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
