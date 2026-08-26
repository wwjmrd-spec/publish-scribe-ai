import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Client as FtpClient } from "npm:basic-ftp@5.0.5";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** article-title-slug_1234.pdf */
function buildFileName(title: string, reference: string) {
  const slug = (title || "article")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 150)
    .replace(/^-|-$/g, "");
  const digits = (reference || "").replace(/\D/g, "").slice(-4) || "0000";
  return `${slug || "article"}_${digits}.pdf`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { articleId, pdfBase64 } = await req.json();
    if (!articleId || !pdfBase64) return json({ error: "articleId and pdfBase64 are required" }, 400);

    const host = Deno.env.get("WWJMRD_FTP_HOST");
    const user = Deno.env.get("WWJMRD_FTP_USER");
    const password = Deno.env.get("WWJMRD_FTP_PASSWORD");
    if (!host || !user || !password) return json({ error: "FTP credentials are not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: article, error } = await supabase
      .from("articles")
      .select("id, title, reference_number")
      .eq("id", articleId)
      .maybeSingle();
    if (error) throw error;
    if (!article) return json({ error: "Article not found" }, 404);

    const fileName = buildFileName(article.title, article.reference_number);
    const bytes = Buffer.from(pdfBase64.replace(/^data:[^,]+,/, ""), "base64");
    if (!bytes.length) return json({ error: "Empty PDF payload" }, 400);

    const client = new FtpClient(30_000);
    client.ftp.verbose = false;
    try {
      await client.access({
        host: host.replace(/^ftps?:\/\//i, ""),
        user,
        password,
        secure: false,
      });
      await client.ensureDir("/upload2");
      await client.uploadFrom(Readable.from(bytes), fileName);
    } finally {
      client.close();
    }

    const publicUrl = `https://wwjmrd.com/upload2/${fileName}`;
    await supabase
      .from("articles")
      .update({ published_pdf_url: publicUrl })
      .eq("id", articleId);

    console.log("Uploaded formatted PDF to FTP", { articleId, fileName, size: bytes.length });
    return json({ success: true, fileName, url: publicUrl });
  } catch (err) {
    console.error("upload-article-pdf error", err);
    return json({ error: err instanceof Error ? err.message : "Upload failed" }, 500);
  }
});
