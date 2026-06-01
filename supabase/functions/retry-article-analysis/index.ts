import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX = 500;
function norm(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const r = Math.round(v);
    return r >= 1 && r <= MAX ? r : null;
  }
  if (typeof v === "string" && v.trim()) {
    const p = parseInt(v.trim(), 10);
    return Number.isFinite(p) && p >= 1 && p <= MAX ? p : null;
  }
  return null;
}

async function extractPageCount(ab: ArrayBuffer): Promise<number | null> {
  try {
    const zip = await JSZip.loadAsync(ab);
    const appXml = await zip.file("docProps/app.xml")?.async("string");
    if (appXml) {
      const m = appXml.match(/<Pages>(\d+)<\/Pages>/i);
      const pc = norm(m?.[1]);
      if (pc) return pc;
    }
    const docXml = await zip.file("word/document.xml")?.async("string");
    if (docXml) {
      const breaks = (docXml.match(/<w:lastRenderedPageBreak\b/g) || []).length;
      if (breaks > 0) return breaks + 1;
      const text = docXml.replace(/<[^>]+>/g, " ");
      const words = text.split(/\s+/).filter(Boolean).length;
      if (words > 0) return Math.max(1, Math.ceil(words / 425));
    }
  } catch (e) {
    console.error("docx parse failed", e);
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const articleId: string | undefined = body?.articleId;
    if (!articleId) {
      return new Response(JSON.stringify({ error: "articleId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: article, error } = await supabase
      .from("articles")
      .select("id, document_url, page_count, article_reviews(id)")
      .eq("id", articleId)
      .maybeSingle();

    if (error || !article) {
      return new Response(JSON.stringify({ error: "Article not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result: any = {
      page_count_before: (article as any).page_count,
      page_count_after: (article as any).page_count,
      ai_review_triggered: false,
    };

    // Retry page count
    if (!(article as any).page_count && article.document_url) {
      try {
        const { data: fileData, error: dlErr } = await supabase.storage
          .from("documents")
          .download(article.document_url);
        if (!dlErr && fileData) {
          const ab = await fileData.arrayBuffer();
          const pc = await extractPageCount(ab);
          if (pc) {
            await supabase.from("articles").update({ page_count: pc }).eq("id", articleId);
            result.page_count_after = pc;
          }
        }
      } catch (e: any) {
        console.error("page count retry failed", e);
        result.page_count_error = String(e?.message || e);
      }
    }

    // Retry AI review if none exists
    const hasReview = Array.isArray((article as any).article_reviews) && (article as any).article_reviews.length > 0;
    if (!hasReview && article.document_url) {
      fetch(`${supabaseUrl}/functions/v1/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ articleId }),
      }).catch((e) => console.error("ai-review retry trigger failed", e));
      result.ai_review_triggered = true;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("retry-article-analysis error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
