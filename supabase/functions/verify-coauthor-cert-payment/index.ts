import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "npm:jspdf@2.5.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  currentDate: string
): ArrayBuffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Colors
  const darkBlue = [44, 62, 80] as [number, number, number];
  const accentBlue = [52, 152, 219] as [number, number, number];
  const certGreen = [39, 174, 96] as [number, number, number];
  const grayText = [102, 102, 102] as [number, number, number];
  const white = [255, 255, 255] as [number, number, number];
  const lightBg = [248, 249, 250] as [number, number, number];

  // ===== OUTER BORDER =====
  doc.setDrawColor(...darkBlue);
  doc.setLineWidth(2);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

  // Inner border
  doc.setDrawColor(...certGreen);
  doc.setLineWidth(0.8);
  doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

  // ===== HEADER =====
  let y = 28;

  // Journal title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...darkBlue);
  doc.text("World Wide Journal of Multidisciplinary Research and Development", pageWidth / 2, y, { align: "center" });
  y += 10;

  // Badges line
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

  // ISSN
  doc.setFontSize(9);
  doc.setTextColor(...grayText);
  doc.text("PRINT-ISSN: 2454-6615  |  ONLINE-ISSN: 2454-6615", pageWidth / 2, y, { align: "center" });
  y += 6;

  // Separator
  doc.setDrawColor(...certGreen);
  doc.setLineWidth(0.5);
  doc.line(40, y, pageWidth - 40, y);
  y += 12;

  // ===== CERTIFICATE TITLE =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(...certGreen);
  doc.text("Co-Author Certificate", pageWidth / 2, y, { align: "center" });

  // Underline
  const titleWidth = doc.getTextWidth("Co-Author Certificate");
  doc.setDrawColor(...certGreen);
  doc.setLineWidth(0.8);
  doc.line((pageWidth - titleWidth) / 2, y + 2, (pageWidth + titleWidth) / 2, y + 2);
  y += 16;

  // ===== CONTENT =====
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

  // Article title (italic, green)
  doc.setFont("helvetica", "bolditalic");
  doc.setTextColor(...certGreen);
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
    ["Reference No.", refNumber],
  ];

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

  // ===== MAIN AUTHOR =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...darkBlue);
  const mainAuthorLabel = "Main Author: ";
  const mainAuthorFullText = mainAuthorLabel + mainAuthorName;
  doc.text(mainAuthorLabel, pageWidth / 2 - doc.getTextWidth(mainAuthorFullText) / 2, y);
  doc.setFont("helvetica", "normal");
  doc.text(mainAuthorName, pageWidth / 2 - doc.getTextWidth(mainAuthorFullText) / 2 + doc.getTextWidth(mainAuthorLabel), y);
  y += 8;

  // ===== FOOTER =====
  const footerY = pageHeight - 35;

  // Certificate info (left)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...grayText);
  doc.text(`Certificate No.: ${certificateNumber}`, 25, footerY);
  doc.text(`Date: ${currentDate}`, 25, footerY + 6);

  // Signature (right)
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

  // Bottom journal info
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Authorization header required");

    // Auth: verify JWT using anon key client + getClaims
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error("Auth verification failed:", claimsError?.message);
      throw new Error("Unauthorized");
    }

    const user = { id: claimsData.claims.sub as string };
    console.log("Authenticated user for co-author cert verification:", user.id);

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

    // Generate co-author PDF certificate
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
      currentDate
    );

    // Store PDF certificate
    const fileName = `coauthor-cert-${refNumber}-${coAuthor?.name?.replace(/\s+/g, "-").toLowerCase() || certRecordId}.pdf`;

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

    // Update certificate record - store only the filename (not signed URL)
    const { error: updateError } = await serviceClient
      .from("co_author_certificates")
      .update({
        payment_status: "paid",
        payment_id: razorpayPaymentId,
        certificate_url: fileName,
      })
      .eq("id", certRecordId);

    if (updateError) {
      console.error("Failed to update cert record:", updateError);
      throw new Error("Failed to update certificate record");
    }

    console.log("Co-author PDF certificate generated:", fileName);

    return new Response(
      JSON.stringify({
        success: true,
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
