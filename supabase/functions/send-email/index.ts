import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type EmailTemplate = "password-reset" | "email-verification" | "welcome" | "custom";

interface EmailRequest {
  to: string;
  template: EmailTemplate;
  data?: {
    resetUrl?: string;
    verifyUrl?: string;
    loginUrl?: string;
    userName?: string;
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
  .step-number {
    background-color: #00d4ff;
    color: #0d1528;
    border-radius: 50%;
    width: 28px;
    height: 28px;
    font-size: 14px;
    font-weight: 600;
    text-align: center;
    line-height: 28px;
    display: inline-block;
    margin-right: 12px;
  }
  .step-heading {
    color: #ffffff;
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 4px;
  }
  .step-description {
    color: #9ca3af;
    font-size: 14px;
    line-height: 20px;
    margin: 0 0 16px;
    padding-left: 40px;
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
      <p class="logo-text">PubPortal</p>
    </div>
    
    <h1>Reset Your Password</h1>
    
    <p>Hi ${userName},</p>
    
    <p>We received a request to reset your password for your PubPortal account. Click the button below to set a new password:</p>
    
    <div class="button-container">
      <a href="${resetUrl}" class="button">Reset Password</a>
    </div>
    
    <p>Or copy and paste this link into your browser:</p>
    <p class="link"><a href="${resetUrl}" style="color: #00d4ff;">${resetUrl}</a></p>
    
    <hr>
    
    <p class="footer-text">This link will expire in 1 hour for security reasons. If you didn't request a password reset, you can safely ignore this email.</p>
    
    <p class="footer">© ${new Date().getFullYear()} PubPortal. All rights reserved.</p>
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
      <p class="logo-text">PubPortal</p>
    </div>
    
    <h1>Verify Your Email</h1>
    
    <p>Hi ${userName},</p>
    
    <p>Welcome to PubPortal! Please verify your email address to get started with publishing your research articles.</p>
    
    <div class="button-container">
      <a href="${verifyUrl}" class="button">Verify Email Address</a>
    </div>
    
    <p>Or copy and paste this link into your browser:</p>
    <p class="link"><a href="${verifyUrl}" style="color: #00d4ff;">${verifyUrl}</a></p>
    
    <hr>
    
    <div class="features-box">
      <p class="features-title">What you can do with PubPortal:</p>
      <p class="feature-item">📝 Submit research articles for publication</p>
      <p class="feature-item">📊 Track your submission status</p>
      <p class="feature-item">🏆 Receive publication certificates</p>
      <p class="feature-item">👥 Manage co-authors</p>
    </div>
    
    <hr>
    
    <p class="footer-text">This link will expire in 24 hours. If you didn't create an account with PubPortal, you can safely ignore this email.</p>
    
    <p class="footer">© ${new Date().getFullYear()} PubPortal. All rights reserved.</p>
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
  <title>Welcome to PubPortal</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <p class="logo-text">PubPortal</p>
    </div>
    
    <h1>Welcome to PubPortal! 🎉</h1>
    
    <p>Hi ${userName},</p>
    
    <p>Congratulations! Your email has been verified and your PubPortal account is now active. You're ready to start submitting your research articles for publication.</p>
    
    <div class="button-container">
      <a href="${loginUrl}" class="button">Go to Dashboard</a>
    </div>
    
    <hr>
    
    <p class="features-title">Getting Started:</p>
    
    <p><span class="step-number">1</span><strong class="step-heading">Submit Your Article</strong></p>
    <p class="step-description">Navigate to "Submit Article" and upload your research paper with title, abstract, and keywords.</p>
    
    <p><span class="step-number">2</span><strong class="step-heading">Track Your Submission</strong></p>
    <p class="step-description">Monitor your article's progress through review in "My Articles" section.</p>
    
    <p><span class="step-number">3</span><strong class="step-heading">Get Published</strong></p>
    <p class="step-description">Once approved, complete the publication fee and receive your official certificate.</p>
    
    <hr>
    
    <p class="footer-text">If you have any questions, don't hesitate to reach out to our support team.</p>
    
    <p class="footer">© ${new Date().getFullYear()} PubPortal. All rights reserved.</p>
  </div>
</body>
</html>
`;

const getEmailContent = (
  template: EmailTemplate,
  data: EmailRequest["data"]
): { subject: string; html: string } => {
  switch (template) {
    case "password-reset":
      return {
        subject: "Reset Your PubPortal Password",
        html: getPasswordResetTemplate(data?.resetUrl || "", data?.userName),
      };

    case "email-verification":
      return {
        subject: "Verify Your PubPortal Email",
        html: getEmailVerificationTemplate(data?.verifyUrl || "", data?.userName),
      };

    case "welcome":
      return {
        subject: "Welcome to PubPortal! 🎉",
        html: getWelcomeTemplate(data?.loginUrl || "", data?.userName),
      };

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
    const body: EmailRequest = await req.json();
    const { to, template, data, subject, html, from } = body;

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
      const content = getEmailContent(template, data);
      emailSubject = content.subject;
      emailHtml = content.html;
    } else {
      throw new Error("Missing required field: template");
    }

    console.log(`Sending ${template} email to: ${to}, subject: ${emailSubject}`);

    const emailResponse = await resend.emails.send({
      from: from || "PubPortal <noreply@resend.dev>", // Replace with your verified domain
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
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
