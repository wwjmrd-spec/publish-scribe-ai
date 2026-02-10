import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRO_COAUTHOR_LIMIT = 4;

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function generateCoAuthorCertificatePdf(
  coAuthorName: string,
  coAuthorAffiliation: string,
  articleTitle: string,
  volume: string,
  issue: string,
  pageNumber: string,
  year: string,
  refNumber: string,
  mainAuthorName: string,
  certificateNumber: string,
  currentDate: string,
  stampImageBase64: string | null
): ArrayBuffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const darkBlue = [44, 62, 80] as [number, number, number];
  const certGreen = [39, 174, 96] as [number, number, number];
  const grayText = [102, 102, 102] as [number, number, number];
  const white = [255, 255, 255] as [number, number, number];
  const lightBg = [248, 249, 250] as [number, number, number];

  doc.setDrawColor(...darkBlue);
  doc.setLineWidth(2);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

  doc.setDrawColor(...certGreen);
  doc.setLineWidth(0.8);
  doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

  let y = 28;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...darkBlue);
  doc.text("World Wide Journal of Multidisciplinary Research and Development", pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const badges = ["International Journal", "Peer Reviewed Journal", "Refereed Journal", "Indexed Journal"];
  const badgeWidth = 42;
  const totalBadgeWidth = badges.length * badgeWidth + (badges.length - 1) * 4;
  let bx = (pageWidth - totalBadgeWidth) / 2;
  for (const badge of badges) {
    doc.setFillColor(...certGreen);
    doc.roundedRect(bx, y - 4, badgeWidth, 7, 1.5, 1.5, "F");
    doc.setTextColor(...white);
    doc.text(badge, bx + badgeWidth / 2, y + 0.5, { align: "center" });
    bx += badgeWidth + 4;
  }
  y += 10;

  doc.setFontSize(9);
  doc.setTextColor(...grayText);
  doc.text("ONLINE-ISSN: 2454-6615", pageWidth / 2, y, { align: "center" });
  y += 6;

  doc.setDrawColor(...certGreen);
  doc.setLineWidth(0.5);
  doc.line(40, y, pageWidth - 40, y);
  y += 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(...certGreen);
  doc.text("Co-Author Certificate", pageWidth / 2, y, { align: "center" });

  const titleWidth = doc.getTextWidth("Co-Author Certificate");
  doc.setDrawColor(...certGreen);
  doc.setLineWidth(0.8);
  doc.line((pageWidth - titleWidth) / 2, y + 2, (pageWidth + titleWidth) / 2, y + 2);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...darkBlue);

  let certText = `This is to certify that "${coAuthorName}"`;
  if (coAuthorAffiliation && coAuthorAffiliation !== "N/A") {
    certText += `, affiliated to "${coAuthorAffiliation}"`;
  }
  certText += ` has contributed as a co-author in the manuscript titled`;

  const lines = doc.splitTextToSize(certText, pageWidth - 80);
  for (const line of lines) {
    doc.text(line, pageWidth / 2, y, { align: "center" });
    y += 7;
  }

  doc.setFont("helvetica", "bolditalic");
  doc.setTextColor(...certGreen);
  doc.setFontSize(13);
  const titleLines = doc.splitTextToSize(`"${articleTitle}"`, pageWidth - 80);
  for (const line of titleLines) {
    doc.text(line, pageWidth / 2, y, { align: "center" });
    y += 7;
  }
  y += 6;

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
    ["Reference No.", refNumber],
  ];

  const tableWidth = 120;
  const colWidth = tableWidth / 2;
  const tableX = (pageWidth - tableWidth) / 2;
  const rowHeight = 9;

  for (let i = 0; i < tableData.length; i++) {
    const rowY = y + i * rowHeight;
    doc.setFillColor(...lightBg);
    doc.rect(tableX, rowY, colWidth, rowHeight, "F");
    doc.setDrawColor(200, 200, 200);
    doc.rect(tableX, rowY, colWidth, rowHeight, "S");
    doc.setFillColor(...white);
    doc.rect(tableX + colWidth, rowY, colWidth, rowHeight, "F");
    doc.rect(tableX + colWidth, rowY, colWidth, rowHeight, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...darkBlue);
    doc.text(tableData[i][0], tableX + 5, rowY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(tableData[i][1], tableX + colWidth + 5, rowY + 6);
  }

  y += tableData.length * rowHeight + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...darkBlue);
  const mainAuthorLabel = "Main Author: ";
  const mainAuthorFullText = mainAuthorLabel + mainAuthorName;
  doc.text(mainAuthorLabel, pageWidth / 2 - doc.getTextWidth(mainAuthorFullText) / 2, y);
  doc.setFont("helvetica", "normal");
  doc.text(mainAuthorName, pageWidth / 2 - doc.getTextWidth(mainAuthorFullText) / 2 + doc.getTextWidth(mainAuthorLabel), y);
  y += 8;

  const footerY = pageHeight - 40;
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
      doc.setFont("helvetica", "italic");
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

  const bottomY = pageHeight - 16;
  doc.setFontSize(8);
  doc.setTextColor(...grayText);
  doc.text("World Wide Journal of Multidisciplinary Research and Development  |  Email: wwjmrd@gmail.com  |  Website: www.wwjmrd.com", pageWidth / 2, bottomY, { align: "center" });

  return doc.output("arraybuffer");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Authorization header required");

    const token = authHeader.replace("Bearer ", "");

    // Parse request body first
    const body = await req.json();
    const { coAuthorId, articleId, paidViaCart, userId: bodyUserId } = body;
    if (!coAuthorId || !articleId) throw new Error("Missing required fields");

    // Determine if this is an internal service role call
    const isInternalCall = token === supabaseServiceKey && paidViaCart === true;

    let userId: string;

    if (isInternalCall) {
      // Internal call from verify-payment - skip Pro check
      if (!bodyUserId) throw new Error("userId required for internal calls");
      userId = bodyUserId;
      console.log("Internal call: generating paid co-author cert for user:", userId);
    } else {
      // Normal user auth flow
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);

      if (claimsError || !claimsData?.claims) {
        console.error("Auth verification failed:", claimsError?.message);
        throw new Error("Unauthorized");
      }

      userId = claimsData.claims.sub as string;
      console.log("Generating free co-author cert for user:", userId);
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    if (!isInternalCall) {
      // Verify Pro subscription (only for user calls)
      const { data: subscription } = await serviceClient
        .from("user_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .eq("plan_type", "pro")
        .maybeSingle();

      if (!subscription) {
        throw new Error("Pro subscription required for free co-author certificates");
      }

      if (subscription.expires_at && new Date(subscription.expires_at) < new Date()) {
        throw new Error("Pro subscription has expired");
      }

      // Check monthly usage
      const currentMonth = getCurrentMonth();
      const { data: usage } = await serviceClient
        .from("plan_usage")
        .select("*")
        .eq("user_id", userId)
        .eq("usage_month", currentMonth)
        .maybeSingle();

      const coauthorCertsUsed = usage?.coauthor_certs_used ?? 0;
      if (coauthorCertsUsed >= PRO_COAUTHOR_LIMIT) {
        throw new Error("Monthly co-author certificate limit reached");
      }
    }

    // Verify article belongs to user and is published
    const { data: article, error: articleError } = await serviceClient
      .from("articles")
      .select("id, author_id, status, title, reference_number, volume, issue, page_number, publication_year, profiles:author_id (full_name, affiliation)")
      .eq("id", articleId)
      .eq("author_id", userId)
      .eq("status", "published")
      .single();

    if (articleError || !article) {
      throw new Error("Article not found, not yours, or not published");
    }

    // Verify co-author belongs to this article
    const { data: coAuthor, error: coAuthorError } = await serviceClient
      .from("co_authors")
      .select("id, name, affiliation")
      .eq("id", coAuthorId)
      .eq("article_id", articleId)
      .single();

    if (coAuthorError || !coAuthor) {
      throw new Error("Co-author not found for this article");
    }

    // Check if already generated
    const { data: existingCert } = await serviceClient
      .from("co_author_certificates")
      .select("id, payment_status, certificate_url")
      .eq("co_author_id", coAuthorId)
      .eq("article_id", articleId)
      .maybeSingle();

    if (existingCert?.payment_status === "paid" && existingCert?.certificate_url) {
      return new Response(
        JSON.stringify({ success: true, message: "Certificate already generated" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate PDF
    const mainAuthor = article.profiles as any;
    const coAuthorName = coAuthor.name || "Unknown";
    const coAuthorAffiliation = coAuthor.affiliation || "N/A";
    const articleTitle = article.title || "Unknown";
    const refNumber = article.reference_number || "N/A";
    const volume = article.volume || "N/A";
    const issue = article.issue || "N/A";
    const pageNumber = article.page_number || "N/A";
    const publicationYear = article.publication_year || "N/A";
    const mainAuthorName = mainAuthor?.full_name || "Unknown";

    const certificateNumber = `CA-${volume}-${issue}-${(pageNumber as string).split("-")[0] || pageNumber}`;
    const currentDate = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Fetch publisher stamp image
    let stampImageBase64: string | null = null;
    try {
      const stampUrl = `${supabaseUrl}/storage/v1/object/public/email-assets/publisher-stamp.png`;
      const stampRes = await fetch(stampUrl);
      if (stampRes.ok) {
        const stampBuffer = await stampRes.arrayBuffer();
        const stampBytes = new Uint8Array(stampBuffer);
        stampImageBase64 = "data:image/png;base64," + base64Encode(stampBytes);
      }
    } catch (e) {
      console.error("Failed to fetch stamp image:", e);
    }

    console.log("Generating PDF certificate for co-author:", coAuthorName);

    const pdfBuffer = generateCoAuthorCertificatePdf(
      coAuthorName,
      coAuthorAffiliation,
      articleTitle,
      volume,
      issue,
      pageNumber,
      publicationYear,
      refNumber,
      mainAuthorName,
      certificateNumber,
      currentDate,
      stampImageBase64
    );

    // Store PDF
    const fileName = `coauthor-cert-${refNumber}-${coAuthor.name?.replace(/\s+/g, "-").toLowerCase() || coAuthorId}.pdf`;
    const { error: uploadError } = await serviceClient.storage
      .from("certificates")
      .upload(fileName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Failed to store certificate");
    }

    // Create or update certificate record
    const certPaymentId = isInternalCall ? "paid_via_cart" : "pro_plan_free";

    if (existingCert) {
      await serviceClient
        .from("co_author_certificates")
        .update({
          payment_status: "paid",
          payment_id: certPaymentId,
          certificate_url: fileName,
          amount_paid: isInternalCall ? (existingCert as any).amount_paid || 0 : 0,
        })
        .eq("id", existingCert.id);
    } else {
      const { error: insertError } = await serviceClient
        .from("co_author_certificates")
        .insert({
          co_author_id: coAuthorId,
          article_id: articleId,
          payment_status: "paid",
          payment_id: certPaymentId,
          certificate_url: fileName,
          amount_paid: 0,
        });

      if (insertError) {
        console.error("Failed to create cert record:", insertError);
        throw new Error("Failed to create certificate record");
      }
    }

    // Increment usage only for free Pro certs (not paid via cart)
    if (!isInternalCall) {
      const currentMonth = getCurrentMonth();
      const { data: usage } = await serviceClient
        .from("plan_usage")
        .select("*")
        .eq("user_id", userId)
        .eq("usage_month", currentMonth)
        .maybeSingle();

      const coauthorCertsUsed = usage?.coauthor_certs_used ?? 0;

      if (usage) {
        await serviceClient
          .from("plan_usage")
          .update({
            coauthor_certs_used: coauthorCertsUsed + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", usage.id);
      } else {
        await serviceClient
          .from("plan_usage")
          .insert({
            user_id: userId,
            usage_month: currentMonth,
            coauthor_certs_used: 1,
          });
      }
    }

    console.log("Co-author certificate generated:", fileName);

    return new Response(
      JSON.stringify({ success: true, certificateNumber }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Co-author cert error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate certificate" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
