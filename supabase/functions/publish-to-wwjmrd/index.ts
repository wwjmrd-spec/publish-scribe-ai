import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WWJMRD_ENDPOINT =
  "https://wwjmrd.com/manage/index.php/api/publish_article";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function monthName(m: number): string {
  return [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][Math.max(0, Math.min(11, m - 1))];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const wwjmrdSecret = Deno.env.get("WWJMRD_PUBLISH_SECRET") || "";

    if (!wwjmrdSecret) {
      return json({ error: "WWJMRD_PUBLISH_SECRET is not configured" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (role?.role !== "admin") return json({ error: "Forbidden" }, 403);

    const { articleId, mode } = await req.json().catch(() => ({}));
    if (!articleId) return json({ error: "articleId is required" }, 400);
    const isUpdate = mode === "update";

    // Load article + co-authors
    const { data: article, error: artErr } = await admin
      .from("articles")
      .select(
        "published_pdf_url, id, title, author_name, country, subject, abstract, reason_of_research, keywords, publication_year, volume, issue, page_number, published_link, galley_proof_pdf_url, formatted_document_url, status, wwjmrd_article_id, published_to_wwjmrd_at, author_id, doi_number, doi_paid, co_authors(name, orcid)"
      )
      .eq("id", articleId)
      .maybeSingle();
    if (artErr || !article) return json({ error: "Article not found" }, 404);

    if (isUpdate && !(article as any).wwjmrd_article_id) {
      return json({ error: "This article has not been published to WWJMRD yet, so it cannot be updated." }, 400);
    }

    // Optional admin-curated publication form overrides
    const { data: pubForm } = await admin
      .from("publication_form_data")
      .select(
        "article_title, correspondence_author_name, co_authors_names, country, subject, description, keywords, publication_year_month, doi, abstract, final_pdf_url"
      )
      .eq("article_id", articleId)
      .maybeSingle();

    const { data: authorProfile } = await admin
      .from("profiles")
      .select("orcid")
      .eq("id", (article as any).author_id)
      .maybeSingle();

    const coAuthorOrcids = Array.isArray((article as any).co_authors)
      ? (article as any).co_authors.map((c: any) => c.orcid).filter(Boolean).join(", ")
      : "";

    const coAuthorsStr =
      pubForm?.co_authors_names?.trim() ||
      (Array.isArray((article as any).co_authors)
        ? (article as any).co_authors.map((c: any) => c.name).filter(Boolean).join(", ")
        : "");

    const keywords =
      pubForm?.keywords?.trim() ||
      (Array.isArray(article.keywords) ? article.keywords.join(", ") : "");

    const now = new Date();
    let year = (article.publication_year || "").trim();
    let month = "";
    // publication_year_month may be "2026", "2026-06", "June 2026"
    const ym = (pubForm?.publication_year_month || "").trim();
    if (/^\d{4}-\d{1,2}/.test(ym)) {
      const [y, m] = ym.split("-");
      year = y;
      month = monthName(parseInt(m, 10));
    } else if (/^\d{4}$/.test(ym)) {
      year = ym;
    } else if (ym) {
      // free-form like "June 2026"
      const yMatch = ym.match(/\d{4}/);
      if (yMatch) year = yMatch[0];
      const mMatch = ym.replace(/\d{4}/, "").trim();
      if (mMatch) month = mMatch;
    }

    // The article's own issue/volume are authoritative: issue 07 => July,
    // volume 12 => 2026. They override any publication-form value.
    const issueRaw = String(article.issue ?? "").trim();
    const issueNum = parseInt(issueRaw, 10);
    if (issueNum >= 1 && issueNum <= 12) {
      month = monthName(issueNum);
    }
    const volNum = parseInt(String(article.volume ?? "").trim(), 10);
    if (!year && volNum >= 1) year = String(2014 + volNum);
    if (!year) year = String(now.getFullYear());
    if (!month) month = monthName(now.getMonth() + 1);

    // Order number = position of this article within its volume/issue on WWJMRD.
    let orderNumber = 1;
    if (issueRaw) {
      const { data: siblings } = await admin
        .from("articles")
        .select("id, published_to_wwjmrd_at, wwjmrd_article_id")
        .eq("issue", issueRaw)
        .eq("publication_year", article.publication_year)
        .not("wwjmrd_article_id", "is", null)
        .order("published_to_wwjmrd_at", { ascending: true });
      const list = (siblings ?? []).filter((s: any) => s.id !== articleId);
      const existingIdx = (siblings ?? []).findIndex((s: any) => s.id === articleId);
      orderNumber = isUpdate && existingIdx >= 0 ? existingIdx + 1 : list.length + 1;
    }

    // Build the public PDF URL. NOTE: published_link points at the WWJMRD abstract
    // page (not a PDF), so it must never be used as pdf_url — always sign the file.
    let pdfUrl = "";
    const pdfPath =
      pubForm?.final_pdf_url ||
      (article as any).galley_proof_pdf_url ||
      (article as any).formatted_document_url ||
      "";
    const uploadedPdfUrl = String((article as any).published_pdf_url || "");
    if (uploadedPdfUrl) pdfUrl = uploadedPdfUrl;
    const existingLink = String(article.published_link || "");
    if (!pdfUrl && /\.pdf(\?|$)/i.test(existingLink)) pdfUrl = existingLink;
    if (!pdfUrl && pdfPath) {
      const { data: signed, error: signErr } = await admin.storage
        .from("formatted-articles")
        .createSignedUrl(pdfPath, 60 * 60 * 24 * 365 * 5);
      if (signErr) console.error("Failed to sign PDF path", pdfPath, signErr.message);
      pdfUrl = signed?.signedUrl || "";
    }
    if (!pdfUrl) {
      return json(
        { error: "No final PDF found for this article. Generate the galley proof / formatted PDF first." },
        400,
      );
    }

    const monthNumber = String(
      Math.max(1, Math.min(12, issueNum >= 1 && issueNum <= 12 ? issueNum : new Date(`${month} 1, ${year}`).getMonth() + 1)),
    );
    const issueValue = issueRaw || monthNumber;

    const payload: Record<string, string> = {
      secret: wwjmrdSecret,
      title: pubForm?.article_title || article.title || "",
      author: pubForm?.correspondence_author_name || article.author_name || "",
      co_authors: coAuthorsStr,
      country: pubForm?.country || article.country || "",
      subject: pubForm?.subject || article.subject || "",
      abstract: pubForm?.abstract || article.abstract || "",
      description: pubForm?.description || article.reason_of_research || "",
      keyword: keywords,
      year,
      month,
      month_number: monthNumber,
      publication_month: monthNumber,
      volume: String(article.volume ?? ""),
      volume_number: String(article.volume ?? ""),
      issue: issueValue,
      issue_number: issueValue,
      order_number: String(orderNumber),
      article_order: String(orderNumber),
      // DOI is only sent when the author paid the DOI fee.
      doi: pubForm?.doi || ((article as any).doi_paid ? (article as any).doi_number || "" : ""),
      pdf_url: pdfUrl,
      ...(authorProfile?.orcid?.trim()
        ? { orcid: authorProfile.orcid.trim(), author_orcid: authorProfile.orcid.trim() }
        : {}),
      ...(coAuthorOrcids ? { co_author_orcids: coAuthorOrcids } : {}),
      pdf: pdfUrl,
      file_url: pdfUrl,
    };

    if (isUpdate) {
      const remoteRef = String((article as any).wwjmrd_article_id);
      // The remote endpoint's update parameter name is not documented, so send the
      // common aliases; whichever it reads makes it update instead of insert.
      payload.mode = "update";
      payload.action = "update";
      payload.is_update = "1";
      payload.update = "1";
      payload.id = remoteRef;
      payload.article_id = remoteRef;
      payload.aid = remoteRef;
      payload.wwjmrd_article_id = remoteRef;
    }



    // Log payload WITHOUT the secret
    const { secret: _omit, ...loggable } = payload;
    console.log("WWJMRD publish payload:", JSON.stringify(loggable));

    const postPayload = async (p: Record<string, string>): Promise<Response> => {
      const form = new URLSearchParams();
      for (const [k, v] of Object.entries(p)) form.append(k, v ?? "");
      return fetch(WWJMRD_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
    };

    // Their endpoint's duplicate-DOI check runs `SELECT ... FROM \`article_up\`
    // WHERE doi = '...'` against a table that does not exist (MySQL 1146) and
    // dies with HTTP 500 whenever a non-empty doi is sent. Note the backticked
    // table name — their INSERT goes into `article_article_up`, which must NOT
    // match this check.
    const isDoiLookupCrash = async (r: Response): Promise<boolean> => {
      if (r.status !== 500) return false;
      const probe = await r.clone().text();
      return /`article_up`|Error Number:\s*1146/i.test(probe);
    };

    let res: Response;
    let doiMode: "sent" | "blanked" | "dropped" = "sent";
    try {
      res = await postPayload(payload);
      if (payload.doi && (await isDoiLookupCrash(res))) {
        // First retry with an EMPTY doi: their PHP truthiness check then skips
        // the broken lookup, and their NOT NULL `doi` column gets '' instead of
        // NULL (dropping the key entirely fails with MySQL 1048).
        console.warn("WWJMRD crashed on DOI lookup (article_up missing); retrying with empty doi");
        res = await postPayload({ ...payload, doi: "" });
        doiMode = "blanked";
        if (await isDoiLookupCrash(res)) {
          // Their code runs the lookup unconditionally — drop the key as a last resort.
          console.warn("WWJMRD still crashing with empty doi; retrying without doi field");
          const { doi: _d, ...withoutDoi } = payload;
          res = await postPayload(withoutDoi);
          doiMode = "dropped";
        }
      }
    } catch (e: any) {
      console.error("WWJMRD network error:", e?.message || e);
      return json({ error: "Network error contacting WWJMRD", details: String(e?.message || e) }, 502);
    }

    const text = await res.text();
    console.log("WWJMRD HTTP status:", res.status);
    console.log("WWJMRD response body:", text);

    let body: any = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }

    // Turn their CodeIgniter HTML error pages into a readable one-line message.
    const summarizeRemoteError = (raw: string): string => {
      const lines = [...raw.matchAll(/<p>(.*?)<\/p>/gis)]
        .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
        .filter((l) => l && !/^Filename:/i.test(l) && !/^Line Number:/i.test(l));
      const msg = lines.slice(0, 3).join(" — ");
      return msg.length > 500 ? msg.slice(0, 500) + "…" : msg;
    };

    const previousId = Number((article as any).wwjmrd_article_id);
    const returnedId = Number(body?.article_id);
    const remoteId = Number.isFinite(returnedId)
      ? returnedId
      : isUpdate
        ? previousId
        : NaN;
    // On update the remote must reuse the same record. If it hands back a new id it
    // created a duplicate instead — surface that clearly rather than silently repointing.
    const duplicated = isUpdate && Number.isFinite(previousId) && remoteId !== previousId;


    if (!res.ok || !body || body.success !== true || !Number.isFinite(remoteId)) {
      const remoteDetail = body?.message || body?.error || (!body ? summarizeRemoteError(text) : "");
      const doiNote =
        payload.doi && doiMode !== "sent"
          ? " WWJMRD's endpoint cannot accept a DOI right now (their duplicate-DOI check table 'gst.article_up' doesn't exist — MySQL 1146) and their insert rejects a missing DOI (MySQL 1048). Their publish_article endpoint is broken; ask WWJMRD support to fix it, then retry."
          : "";
      return json(
        {
          error: `WWJMRD returned HTTP ${res.status}${remoteDetail ? `: ${remoteDetail}` : ""}.${doiNote}`,
          httpStatus: res.status,
          response: body ?? summarizeRemoteError(text),
        },
        502,
      );
    }

    // Mark as published (or refresh the publish timestamp on update) on our side
    const publishedAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("articles")
      .update({
        // Keep the original remote id when the remote ignored the update and handed
        // back a throwaway id — the live entry on WWJMRD is still the original one.
        wwjmrd_article_id: duplicated ? previousId : remoteId,

        published_to_wwjmrd_at: isUpdate
          ? ((article as any).published_to_wwjmrd_at || publishedAt)
          : publishedAt,
        status: "published_to_wwjmrd",
        in_publish_queue: false,
        automation_paused: true,
      })
      .eq("id", articleId);
    if (updErr) {
      console.error("Failed to update local article after publish:", updErr.message);
      return json(
        {
          error: "Published to WWJMRD but failed to update local record: " + updErr.message,
          wwjmrd_article_id: remoteId,
        },
        500,
      );
    }

    return json({
      success: true,
      updated: isUpdate,
      duplicated,
      doi_sent: doiMode === "sent",
      previous_wwjmrd_article_id: Number.isFinite(previousId) ? previousId : null,
      warning: duplicated
        ? `WWJMRD created a new entry (ID ${remoteId}) instead of updating ID ${previousId}. The remote API ignored the update request — the old entry ${previousId} must be removed on wwjmrd.com.`
        : doiMode !== "sent"
          ? "Published, but WWJMRD's server crashed when the DOI was included (their duplicate-DOI check table is missing), so the article was published without the DOI. Ask WWJMRD to fix their publish_article endpoint (MySQL error 1146: table 'gst.article_up' doesn't exist), then use Update to re-send the DOI."
          : undefined,
      order_number: orderNumber,
      month,
      year,
      wwjmrd_article_id: remoteId,
      published_to_wwjmrd_at: publishedAt,
    });


  } catch (e: any) {
    console.error("publish-to-wwjmrd error:", e?.message || e);
    return json({ error: e?.message || "Unexpected error" }, 500);
  }
});
