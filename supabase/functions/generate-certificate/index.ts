import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "npm:jspdf@2.5.2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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

type JournalKey = "WWJMRD" | "WWJMER";

interface JournalConfig {
  fullName: string;
  issn: string;
  doiPrefix?: string;
  email: string;
  website: string;
  websiteDisplay: string;
  // Theme colors as RGB triples
  darkBlue: [number, number, number];
  accentBlue: [number, number, number];
  certRed: [number, number, number];
}

const JOURNAL_CONFIGS: Record<JournalKey, JournalConfig> = {
  WWJMRD: {
    fullName: "World Wide Journal of Multidisciplinary Research and Development",
    issn: "ONLINE-ISSN: 2454-6615",
    doiPrefix: "10.67967/wwjmrd",
    email: "support@wwjmrd.com",
    website: "www.wwjmrd.com",
    websiteDisplay: "www.wwjmrd.com",
    darkBlue: [44, 62, 80],
    accentBlue: [52, 152, 219],
    certRed: [231, 76, 60],
  },
  WWJMER: {
    fullName: "World Wide Journal of Multidisciplinary Education and Research",
    issn: "ISSN: 2583-8466",
    email: "wwjmer@gmail.com",
    website: "www.wwjmer.com",
    websiteDisplay: "www.wwjmer.com",
    // Deep Pink / Magenta theme (#EB0A73 = RGB 235, 10, 115)
    darkBlue: [120, 5, 60],     // deep magenta for headings
    accentBlue: [235, 10, 115], // primary magenta accent
    certRed: [235, 10, 115],    // magenta certificate title
  },
};

function generateCertificatePdf(
  journal: JournalConfig,
  authorName: string,
  authorAffiliation: string,
  articleTitle: string,
  volume: string,
  issue: string,
  pageNumber: string,
  year: string,
  coAuthorsStr: string,
  certificateNumber: string,
  currentDate: string,
  stampImageBase64: string | null,
  articleDoi?: string | null
): ArrayBuffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Colors (from journal config)
  const darkBlue = journal.darkBlue;
  const accentBlue = journal.accentBlue;
  const certRed = journal.certRed;
  const grayText = [102, 102, 102] as [number, number, number];
  const white = [255, 255, 255] as [number, number, number];
  const lightBg = [248, 249, 250] as [number, number, number];

  // ===== OUTER BORDER =====
  doc.setDrawColor(...darkBlue);
  doc.setLineWidth(2);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

  // Inner border
  doc.setDrawColor(...accentBlue);
  doc.setLineWidth(0.8);
  doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

  // ===== HEADER =====
  let y = 28;

  // Journal title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...darkBlue);
  doc.text(journal.fullName, pageWidth / 2, y, { align: "center" });
  y += 10;

  // Badges line
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const badges = ["International Journal", "Peer Reviewed Journal", "Refereed Journal", "Indexed Journal"];
  const badgeWidth = 42;
  const totalBadgeWidth = badges.length * badgeWidth + (badges.length - 1) * 4;
  let bx = (pageWidth - totalBadgeWidth) / 2;
  for (const badge of badges) {
    doc.setFillColor(...accentBlue);
    doc.roundedRect(bx, y - 4, badgeWidth, 7, 1.5, 1.5, "F");
    doc.setTextColor(...white);
    doc.text(badge, bx + badgeWidth / 2, y + 0.5, { align: "center" });
    bx += badgeWidth + 4;
  }
  y += 10;

  // ISSN (Online only) + Journal DOI prefix
  doc.setFontSize(9);
  doc.setTextColor(...grayText);
  const issnLine = journal.doiPrefix
    ? `${journal.issn}    DOI: ${journal.doiPrefix}`
    : journal.issn;
  doc.text(issnLine, pageWidth / 2, y, { align: "center" });
  y += 6;

  // Separator
  doc.setDrawColor(...accentBlue);
  doc.setLineWidth(0.5);
  doc.line(40, y, pageWidth - 40, y);
  y += 12;

  // ===== CERTIFICATE TITLE =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(...certRed);
  doc.text("Publication Certificate", pageWidth / 2, y, { align: "center" });

  // Underline
  const titleWidth = doc.getTextWidth("Publication Certificate");
  doc.setDrawColor(...certRed);
  doc.setLineWidth(0.8);
  doc.line((pageWidth - titleWidth) / 2, y + 2, (pageWidth + titleWidth) / 2, y + 2);
  y += 16;

  // ===== CONTENT =====
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...darkBlue);

  const certText = `This is to certify that "${authorName}", affiliated to "${authorAffiliation}" has published manuscript titled`;
  const lines = doc.splitTextToSize(certText, pageWidth - 80);
  for (const line of lines) {
    doc.text(line, pageWidth / 2, y, { align: "center" });
    y += 7;
  }

  // Article title (italic, blue)
  doc.setFont("helvetica", "bolditalic");
  doc.setTextColor(...accentBlue);
  doc.setFontSize(13);
  const titleLines = doc.splitTextToSize(`"${articleTitle}"`, pageWidth - 80);
  for (const line of titleLines) {
    doc.text(line, pageWidth / 2, y, { align: "center" });
    y += 7;
  }
  y += 6;

  // ===== DETAILS TABLE =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...darkBlue);
  doc.text("Details of Published Article as follows:", pageWidth / 2, y, { align: "center" });
  y += 8;

  const tableData = [
    ["Volume", volume],
    ["Year", year],
    ["Issue", issue],
    ["Page Number", pageNumber],
  ];

  // Article DOI row — only when the author has paid for a DOI
  if (articleDoi && String(articleDoi).trim()) {
    tableData.push(["DOI", String(articleDoi).trim()]);
  }

  const tableWidth = 120;
  const colWidth = tableWidth / 2;
  const tableX = (pageWidth - tableWidth) / 2;
  const rowHeight = 9;

  for (let i = 0; i < tableData.length; i++) {
    const rowY = y + i * rowHeight;

    // Label cell (gray bg)
    doc.setFillColor(...lightBg);
    doc.rect(tableX, rowY, colWidth, rowHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.rect(tableX, rowY, colWidth, rowHeight, "S");

    // Value cell
    doc.setFillColor(...white);
    doc.rect(tableX + colWidth, rowY, colWidth, rowHeight, "F");
    doc.rect(tableX + colWidth, rowY, colWidth, rowHeight, "S");

    // Label text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...darkBlue);
    doc.text(tableData[i][0], tableX + 5, rowY + 6);

    // Value text
    doc.setFont("helvetica", "normal");
    doc.text(tableData[i][1], tableX + colWidth + 5, rowY + 6);
  }

  y += tableData.length * rowHeight + 8;

  // ===== CO-AUTHORS =====
  if (coAuthorsStr) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...darkBlue);
    doc.text("Co-Author: ", pageWidth / 2 - doc.getTextWidth("Co-Author: " + coAuthorsStr) / 2, y);
    doc.setFont("helvetica", "normal");
    doc.text(coAuthorsStr, pageWidth / 2 - doc.getTextWidth("Co-Author: " + coAuthorsStr) / 2 + doc.getTextWidth("Co-Author: "), y);
    y += 8;
  }

  // ===== FOOTER =====
  const footerY = pageHeight - 40;

  // Certificate info (left)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...grayText);
  doc.text(`Certificate No.: ${certificateNumber}`, 25, footerY + 10);
  doc.text(`Date: ${currentDate}`, 25, footerY + 16);

  // Publisher stamp image (right)
  if (stampImageBase64) {
    try {
      const stampWidth = 45;
      const stampHeight = 40;
      const stampX = pageWidth - 25 - stampWidth;
      const stampY = footerY - 5;
      doc.addImage(stampImageBase64, "PNG", stampX, stampY, stampWidth, stampHeight);
    } catch (e) {
      console.error("Failed to add stamp image:", e);
      // Fallback to text signature
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...grayText);
      doc.text("Yours Sincerely,", pageWidth - 25, footerY, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...darkBlue);
      doc.text("Deepika Meena", pageWidth - 25, footerY + 7, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...grayText);
      doc.text("Publisher", pageWidth - 25, footerY + 12, { align: "right" });
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...grayText);
    doc.text("Yours Sincerely,", pageWidth - 25, footerY, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...darkBlue);
    doc.text("Deepika Meena", pageWidth - 25, footerY + 7, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...grayText);
    doc.text("Publisher", pageWidth - 25, footerY + 12, { align: "right" });
  }

  // Bottom journal info
  const bottomY = pageHeight - 16;
  doc.setFontSize(8);
  doc.setTextColor(...grayText);
  doc.text(`${journal.fullName}  |  Email: ${journal.email}  |  Website: ${journal.website}`, pageWidth / 2, bottomY, { align: "center" });

  return doc.output("arraybuffer");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: verify JWT using anon key client + getClaims
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error("Auth verification failed:", claimsError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    console.log("Authenticated admin user:", userId);

    // Service role client for data operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { articleId, volume, issue, pageNumber, year, publishedLink, journal: journalKeyRaw } = await req.json();

    if (!articleId || !volume || !issue || !pageNumber || !year) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const journalKey: JournalKey = journalKeyRaw === "WWJMER" ? "WWJMER" : "WWJMRD";
    const journalConfig = JOURNAL_CONFIGS[journalKey];

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

    // Use article reference number as certificate number
    const certificateNumber = article.reference_number || `${volume}-${issue}-${pageNumber.split("-")[0] || pageNumber}`;
    const currentDate = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Build co-authors string
    const coAuthorsStr = article.co_authors
      ?.map((ca: any) => ca.name)
      .join(", ") || "";

    // Prefer the main author name as entered on the article; fall back to account owner
    const authorName =
      (article.author_name && String(article.author_name).trim()) ||
      (article.profiles as any)?.full_name ||
      "Unknown Author";
    const authorAffiliation = (article.profiles as any)?.affiliation || "Unknown Affiliation";

    // Fetch publisher stamp image
    let stampImageBase64: string | null = null;
    try {
      const stampFile = journalKey === "WWJMER" ? "wwjmer-stamp.png" : "publisher-stamp.png";
      const stampUrl = `${supabaseUrl}/storage/v1/object/public/email-assets/${stampFile}`;
      const stampRes = await fetch(stampUrl);
      if (stampRes.ok) {
        const stampBuffer = await stampRes.arrayBuffer();
        const stampBytes = new Uint8Array(stampBuffer);
        stampImageBase64 = "data:image/png;base64," + base64Encode(stampBytes as any);
      }
    } catch (e) {
      console.error("Failed to fetch stamp image:", e);
    }

    // Generate PDF certificate
    console.log("Generating PDF certificate for article:", articleId, "journal:", journalKey);
    const pdfBuffer = generateCertificatePdf(
      journalConfig,
      authorName,
      authorAffiliation,
      article.title,
      volume,
      issue,
      pageNumber,
      year,
      coAuthorsStr,
      certificateNumber,
      currentDate,
      stampImageBase64,
      article.doi_paid && article.doi ? article.doi : null
    );

    // Store certificate PDF
    const fileName = `certificate-${article.reference_number}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("certificates")
      .upload(fileName, pdfBuffer, {
        contentType: "application/pdf",
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

    console.log(`PDF Certificate generated for article ${articleId}, file: ${fileName}`);

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
