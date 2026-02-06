import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// HTML escape function to prevent XSS in certificate templates
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin role
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { articleId, volume, issue, pageNumber, year, publishedLink } = await req.json();

    if (!articleId || !volume || !issue || !pageNumber || !year) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch article with author and co-authors
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select(`
        *,
        profiles:author_id (full_name, email, affiliation),
        co_authors (name, affiliation)
      `)
      .eq("id", articleId)
      .single();

    if (articleError || !article) {
      console.error("Article fetch error:", articleError);
      return new Response(JSON.stringify({ error: "Article not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate certificate number
    const certificateNumber = `${volume}-${issue}-${pageNumber.split("-")[0] || pageNumber}`;
    const currentDate = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Build co-authors string
    const coAuthorsStr = article.co_authors
      ?.map((ca: any) => ca.name)
      .join(", ") || "";

    // Generate HTML certificate
    const authorName = (article.profiles as any)?.full_name || "Unknown Author";
    const authorAffiliation = (article.profiles as any)?.affiliation || "Unknown Affiliation";

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
      border: 2px solid #3498db;
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
      background: #3498db;
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
      color: #e74c3c;
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
      color: #3498db;
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
    
    .co-authors {
      text-align: center;
      margin: 15px 0;
      font-size: 13px;
    }
    
    .co-authors strong {
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
    
    <div class="certificate-title">Publication Certificate</div>
    
    <div class="content">
      <p>This is to certify that <span class="author-name">"${escapeHtml(authorName)}"</span>, affiliated to <span class="author-name">"${escapeHtml(authorAffiliation)}"</span> has published manuscript titled <span class="manuscript-title">"${escapeHtml(article.title)}"</span></p>
    </div>
    
    <div class="details-section">
      <div class="details-title">Details of Published Article as follows:</div>
      <table class="details-table">
        <tr><td>Volume</td><td>${volume}</td></tr>
        <tr><td>Year</td><td>${year}</td></tr>
        <tr><td>Issue</td><td>${issue}</td></tr>
        <tr><td>Page Number</td><td>${pageNumber}</td></tr>
      </table>
    </div>
    
    ${coAuthorsStr ? `<div class="co-authors"><strong>Co-Author:</strong> ${escapeHtml(coAuthorsStr)}</div>` : ''}
    
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

    // Store certificate HTML as a file
    const fileName = `certificate-${article.reference_number}.html`;
    const { error: uploadError } = await supabase.storage
      .from("certificates")
      .upload(fileName, new Blob([certificateHtml], { type: "text/html" }), {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to store certificate" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get signed URL for download
    const { data: signedUrlData } = await supabase.storage
      .from("certificates")
      .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year validity

    // Update article with publication details and status
    const { error: updateError } = await supabase
      .from("articles")
      .update({
        volume,
        issue,
        page_number: pageNumber,
        publication_year: year,
        published_link: publishedLink || null,
        certificate_url: fileName,
        status: "published",
      })
      .eq("id", articleId);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update article" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Certificate generated for article ${articleId}`);

    return new Response(
      JSON.stringify({
        success: true,
        certificateUrl: signedUrlData?.signedUrl,
        certificateNumber,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Certificate generation error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate certificate. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
