import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const body = `${orderId}|${paymentId}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body)
  );
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return expectedSignature === signature;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authorization header required");

    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const {
      certRecordId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = await req.json();

    if (
      !certRecordId ||
      !razorpayOrderId ||
      !razorpayPaymentId ||
      !razorpaySignature
    ) {
      throw new Error("Missing required fields");
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get the certificate record
    const { data: certRecord, error: certError } = await serviceClient
      .from("co_author_certificates")
      .select(
        `
        *,
        co_authors (name, email, affiliation, article_id),
        articles:article_id (
          title, reference_number, volume, issue, page_number, publication_year, published_link,
          profiles:author_id (full_name, affiliation)
        )
      `
      )
      .eq("id", certRecordId)
      .single();

    if (certError || !certRecord) {
      console.error("Certificate record not found:", certError);
      throw new Error("Certificate record not found");
    }

    if (certRecord.payment_status === "paid") {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Already paid",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify Razorpay signature
    const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!RAZORPAY_KEY_SECRET) throw new Error("Payment gateway not configured");

    const verified = await verifyRazorpaySignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      RAZORPAY_KEY_SECRET
    );

    if (!verified) {
      await serviceClient
        .from("co_author_certificates")
        .update({ payment_status: "failed" })
        .eq("id", certRecordId);
      throw new Error("Payment verification failed");
    }

    console.log("Payment verified for co-author certificate:", certRecordId);

    // Generate co-author certificate
    const article = certRecord.articles as any;
    const coAuthor = certRecord.co_authors as any;
    const mainAuthor = article?.profiles as any;

    const coAuthorName = coAuthor?.name || "Unknown";
    const coAuthorAffiliation = coAuthor?.affiliation || "N/A";
    const articleTitle = article?.title || "Unknown";
    const refNumber = article?.reference_number || "N/A";
    const volume = article?.volume || "N/A";
    const issue = article?.issue || "N/A";
    const pageNumber = article?.page_number || "N/A";
    const publicationYear = article?.publication_year || "N/A";
    const mainAuthorName = mainAuthor?.full_name || "Unknown";

    const certificateNumber = `CA-${volume}-${issue}-${(pageNumber as string).split("-")[0] || pageNumber}`;
    const currentDate = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const certificateHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Open+Sans:wght@400;600&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Open Sans', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    
    .certificate {
      width: 800px;
      background: white;
      border: 3px solid #2c3e50;
      padding: 40px;
      position: relative;
    }
    
    .certificate::before {
      content: '';
      position: absolute;
      top: 10px;
      left: 10px;
      right: 10px;
      bottom: 10px;
      border: 2px solid #27ae60;
      pointer-events: none;
    }
    
    .header {
      text-align: center;
      margin-bottom: 20px;
    }
    
    .journal-title {
      font-family: 'Playfair Display', serif;
      font-size: 28px;
      font-weight: 700;
      color: #2c3e50;
      margin-bottom: 5px;
    }
    
    .journal-badges {
      display: flex;
      justify-content: center;
      gap: 10px;
      flex-wrap: wrap;
      margin: 10px 0;
    }
    
    .badge {
      background: #27ae60;
      color: white;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    
    .issn-info {
      font-size: 12px;
      color: #666;
      margin: 10px 0;
    }
    
    .certificate-title {
      font-family: 'Playfair Display', serif;
      font-size: 36px;
      font-weight: 700;
      color: #27ae60;
      text-align: center;
      margin: 25px 0;
      text-decoration: underline;
    }
    
    .content {
      text-align: center;
      line-height: 1.8;
      font-size: 14px;
      margin: 20px 0;
    }
    
    .author-name {
      font-weight: 700;
      color: #2c3e50;
      font-size: 16px;
    }
    
    .manuscript-title {
      font-style: italic;
      font-weight: 600;
      color: #27ae60;
    }
    
    .details-section {
      margin: 30px auto;
      width: 60%;
    }
    
    .details-title {
      font-weight: 700;
      color: #2c3e50;
      margin-bottom: 15px;
      text-align: center;
    }
    
    .details-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .details-table td {
      padding: 8px 15px;
      border: 1px solid #ddd;
    }
    
    .details-table td:first-child {
      font-weight: 600;
      background: #f8f9fa;
      width: 40%;
    }
    
    .main-author {
      text-align: center;
      margin: 15px 0;
      font-size: 13px;
    }
    
    .main-author strong {
      color: #2c3e50;
    }
    
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 40px;
      padding-top: 20px;
    }
    
    .cert-info {
      font-size: 12px;
      color: #666;
    }
    
    .signature-section {
      text-align: center;
    }
    
    .signature-text {
      font-size: 12px;
      color: #666;
      margin-bottom: 5px;
    }
    
    .publisher-name {
      font-weight: 700;
      color: #2c3e50;
    }
    
    .publisher-title {
      font-size: 12px;
      color: #666;
    }
    
    .journal-info {
      font-size: 11px;
      color: #666;
      text-align: center;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="certificate">
    <div class="header">
      <div class="journal-title">World Wide Journal of Multidisciplinary Research and Development</div>
      <div class="journal-badges">
        <span class="badge">International Journal</span>
        <span class="badge">Peer Reviewed Journal</span>
        <span class="badge">Refereed Journal</span>
        <span class="badge">Indexed Journal</span>
      </div>
      <div class="issn-info">
        PRINT-ISSN: 2454-6615 &nbsp;|&nbsp; ONLINE-ISSN: 2454-6615
      </div>
    </div>
    
    <div class="certificate-title">Co-Author Certificate</div>
    
    <div class="content">
      <p>This is to certify that <span class="author-name">"${escapeHtml(coAuthorName)}"</span>${coAuthorAffiliation !== "N/A" ? `, affiliated to <span class="author-name">"${escapeHtml(coAuthorAffiliation)}"</span>` : ""} has contributed as a co-author in the manuscript titled <span class="manuscript-title">"${escapeHtml(articleTitle)}"</span></p>
    </div>
    
    <div class="details-section">
      <div class="details-title">Details of Published Article as follows:</div>
      <table class="details-table">
        <tr><td>Volume</td><td>${escapeHtml(volume)}</td></tr>
        <tr><td>Year</td><td>${escapeHtml(publicationYear)}</td></tr>
        <tr><td>Issue</td><td>${escapeHtml(issue)}</td></tr>
        <tr><td>Page Number</td><td>${escapeHtml(pageNumber)}</td></tr>
        <tr><td>Reference No.</td><td>${escapeHtml(refNumber)}</td></tr>
      </table>
    </div>
    
    <div class="main-author"><strong>Main Author:</strong> ${escapeHtml(mainAuthorName)}</div>
    
    <div class="footer">
      <div class="cert-info">
        <p>Certificate No.: ${certificateNumber}</p>
        <p>Date: ${currentDate}</p>
      </div>
      <div class="signature-section">
        <div class="signature-text">Yours Sincerely,</div>
        <div class="publisher-name">Deepika Meena</div>
        <div class="publisher-title">Publisher</div>
      </div>
    </div>
    
    <div class="journal-info">
      World Wide Journal of Multidisciplinary Research and Development<br>
      Email: wwjmrd@gmail.com | Website: www.wwjmrd.com
    </div>
  </div>
</body>
</html>`;

    // Store certificate
    const fileName = `coauthor-cert-${refNumber}-${coAuthor?.name?.replace(/\s+/g, "-").toLowerCase() || certRecordId}.html`;

    const { error: uploadError } = await serviceClient.storage
      .from("certificates")
      .upload(
        fileName,
        new Blob([certificateHtml], { type: "text/html" }),
        { contentType: "text/html", upsert: true }
      );

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Failed to store certificate");
    }

    // Get signed URL (1 year)
    const { data: signedUrlData } = await serviceClient.storage
      .from("certificates")
      .createSignedUrl(fileName, 60 * 60 * 24 * 365);

    // Update certificate record
    const { error: updateError } = await serviceClient
      .from("co_author_certificates")
      .update({
        payment_status: "paid",
        payment_id: razorpayPaymentId,
        certificate_url: signedUrlData?.signedUrl || fileName,
      })
      .eq("id", certRecordId);

    if (updateError) {
      console.error("Failed to update cert record:", updateError);
      throw new Error("Failed to update certificate record");
    }

    console.log("Co-author certificate generated:", fileName);

    return new Response(
      JSON.stringify({
        success: true,
        certificateUrl: signedUrlData?.signedUrl,
        certificateNumber,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Co-author cert verification error:", error);
    return new Response(
      JSON.stringify({
        error:
          error.message ||
          "Payment verification failed. Please contact support.",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
