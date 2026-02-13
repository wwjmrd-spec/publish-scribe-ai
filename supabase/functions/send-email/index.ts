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
  | "payment-confirmation"
  | "referral-reward"
  | "article-status-change"
  | "review-report-ready"
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
    // Article status change
    status?: string;
  };
  // For custom template
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
    ${emailFooterText("If you have any questions, don't hesitate to reach out to our support team at info@wwjmrd.com.")}
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
        ? emailButton("https://wwjmrdai.lovable.app/admin/articles", "Review Article")
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
      ${emailButton("https://wwjmrdai.lovable.app/author/articles", "Track Your Article")}
    `
    }
    ${emailDivider()}
    ${emailFooterText("If you have any questions, contact us at info@wwjmrd.com")}
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
        ? emailButton("https://wwjmrdai.lovable.app/admin/articles", "View Articles")
        : `
      ${emailP("What happens next:")}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
        <tr><td style="padding:20px;">
          ${emailFeatureItem("✅ Your payment has been confirmed")}
          ${emailFeatureItem("📋 Your article will be processed for publication")}
          ${emailFeatureItem("📜 You'll receive your publication certificate soon")}
        </td></tr>
      </table>
      ${emailButton("https://wwjmrdai.lovable.app/author/certificates", "View Certificates")}
    `
    }
    ${emailDivider()}
    ${emailFooterText("This email serves as your payment receipt. For any queries, contact us at info@wwjmrd.com")}
  `;
  return wrapEmail(isAdmin ? "Payment Received" : "Payment Successful", body);
};

const getReferralRewardTemplate = (data: EmailRequest["data"]): string => {
  const isReferrer = data?.rewardType === "referrer";

  const body = `
    ${emailH1(isReferrer ? "Referral Reward Earned! 🎉" : "Congratulations on Your Publication! 🎉")}
    ${emailP(`Hi ${escapeHtml(isReferrer ? data?.referrerName || "Author" : data?.referredName || "Author")},`)}
    ${
      isReferrer
        ? `
      ${emailP(`Great news! Your referred author <strong style="color:#ffffff;">${escapeHtml(data?.referredName || "an author")}</strong> just got their article published on WWJMRD.`)}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1f1535" style="background-color:rgba(168,85,247,0.12); border-radius:8px; margin:20px 0;">
        <tr><td align="center" style="padding:20px;">
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#a855f7; margin:0;">REWARD EARNED</p>
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:36px; font-weight:700; color:#a855f7; margin:8px 0;">+${data?.bonusDownloads || 2}</p>
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:14px; color:#d1d5db; margin:0;">Bonus Review Report Downloads</p>
        </td></tr>
      </table>
      ${emailP("These bonus downloads have been automatically added to your account. You can use them to download AI review reports for your articles.")}
    `
        : `
      ${emailP(`Your article <strong style="color:#ffffff;">"${escapeHtml(data?.articleTitle || "")}"</strong> has been published on WWJMRD!`)}
      ${emailP(`Thanks to your publication, the author who referred you (<strong style="color:#ffffff;">${escapeHtml(data?.referrerName || "your referrer")}</strong>) has also earned bonus review report downloads as a reward.`)}
    `
    }
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#1a2340" style="background-color:#1a2340; border-radius:8px; margin:20px 0;">
      <tr><td style="padding:20px;">
        <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; font-size:16px; font-weight:600; color:#ffffff; margin:0 0 12px;">Keep Earning Rewards:</p>
        ${emailFeatureItem("🔗 Share your unique referral code with other researchers")}
        ${emailFeatureItem('📝 When they sign up and get published, you earn <strong style="color:#ffffff;">+2 bonus downloads</strong>')}
        ${emailFeatureItem("🏆 There's no limit to how many rewards you can earn!")}
      </td></tr>
    </table>
    ${emailButton("https://wwjmrdai.lovable.app/author/rewards", isReferrer ? "View Your Rewards" : "View Your Referral Code")}
    ${emailDivider()}
    ${emailFooterText("Keep sharing your referral code to earn more rewards. For any questions, contact us at info@wwjmrd.com")}
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
          "Unfortunately, your article did not meet our publication criteria at this time. You are welcome to revise and resubmit.",
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
  const isPendingFee = data?.status === "pending_fee";
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
    ${
      isPendingFee
        ? emailP("Please log in to your dashboard to complete the payment and proceed with publication.") +
          emailButton("https://wwjmrdai.lovable.app/author/articles", "Pay Publication Fee")
        : emailButton("https://wwjmrdai.lovable.app/author/articles", "View My Articles")
    }
    ${emailDivider()}
    ${emailFooterText("If you have any questions about this update, contact us at info@wwjmrd.com")}
  `;
  return wrapEmail(info.title, body);
};

const getReviewReportReadyTemplate = (data: EmailRequest["data"]): string => {
  const infoRows = [
    emailInfoRow("Reference Number", escapeHtml(data?.referenceNumber || "N/A")),
    emailInfoRow("Title", escapeHtml(data?.articleTitle || "N/A")),
    emailInfoRow("Overall Score", `${(data as any)?.overallScore ?? "N/A"}%`),
    emailInfoRow("Recommendation", escapeHtml(((data as any)?.recommendation || "N/A").replace(/_/g, " "))),
  ].join("");

  const body = `
    ${emailH1("Review Report Ready 📊")}
    ${emailP(`Dear ${escapeHtml(data?.authorName || "Author")},`)}
    ${emailP(`The AI review report for your article has been generated and is now available for download in your dashboard.`)}
    ${emailInfoBox("Review Summary", infoRows)}
    ${emailP("Log in to your dashboard to view the full review report and download it.")}
    ${emailDivider()}
    ${emailFooterText("This is an automated notification from WWJMRD. If you have questions about the review, please contact us at wwjmrd@gmail.com.")}
  `;
  return wrapEmail("Review Report Ready", body);
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
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: EmailRequest & { isAdmin?: boolean; test?: boolean } = await req.json();

    // Allow a simple test mode to verify Resend connectivity
    if (body.test === true) {
      console.log("Test mode: sending test email to admin");
      try {
        const testResult = await resend.emails.send({
          from: "WWJMRD <info@wwjmrd.com>",
          to: ["shubhmeena23@gmail.com"],
          subject: "WWJMRD Test Email ✅",
          html: wrapEmail("Test Email", `
            ${emailH1("Email Delivery Test ✅")}
            ${emailP("This is a test email to verify that WWJMRD email delivery is working correctly.")}
            ${emailP("If you received this email, the Resend integration is functioning properly.")}
            ${emailP(`Sent at: ${new Date().toISOString()}`)}
          `),
        });
        console.log("Test email result:", JSON.stringify(testResult));
        return new Response(JSON.stringify({ success: true, result: testResult }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (testErr: any) {
        console.error("Test email failed:", testErr?.message, JSON.stringify(testErr));
        return new Response(JSON.stringify({ success: false, error: testErr?.message || "Unknown error" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Authenticate the request - accept valid user JWT or service role key
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
      console.log("Email request authenticated for user:", userData.user.id);
    } else {
      console.log("Email request authenticated via service role");
    }

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

    console.log("Email sent successfully:", JSON.stringify(emailResponse));

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
