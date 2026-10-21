import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { Client as FtpClient } from "npm:basic-ftp@5.0.5";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import tls from "node:tls";

// Deno's Node TLS layer lacks a few methods basic-ftp calls after the FTPS
// upgrade ("socket.getProtocol is not a function"). They are informational
// (logging) or optional (TLS session reuse), so safe fallbacks suffice.
const tlsProto = (tls as any).TLSSocket?.prototype;
if (tlsProto && typeof tlsProto.getProtocol !== "function") tlsProto.getProtocol = () => "TLS";
if (tlsProto && typeof tlsProto.getSession !== "function") tlsProto.getSession = () => undefined;

const bodySchema = z.object({ articleId: z.string().uuid(), pdfBase64: z.string().min(1).max(40_000_000) });

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

const CLOUDFLARE_FTP_ERROR =
  "The saved FTP address points to Cloudflare, which only carries website traffic and cannot carry FTP, so the PDF upload can never connect. " +
  "Fix: in Cloudflare DNS set the 'ftp' record to 'DNS only' (grey cloud), or replace the saved FTP host with the hosting server's direct IP address. The article has not been published.";

// Published Cloudflare ranges (https://www.cloudflare.com/ips/).
const CF_V4 = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];
const CF_V6_PREFIXES = ["2400:cb00:", "2606:4700:", "2803:f800:", "2405:b500:", "2405:8100:", "2c0f:f248:", "2a06:98c"];

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}
function inCidr(ip: string, cidr: string) {
  const [base, bits] = cidr.split("/");
  const mask = bits === "0" ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}
export function isCloudflareIp(ip: string) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return CF_V4.some((c) => inCidr(ip, c));
  const lower = ip.toLowerCase();
  return CF_V6_PREFIXES.some((p) => lower.startsWith(p));
}

async function resolvesToCloudflare(hostname: string): Promise<boolean> {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":")) return isCloudflareIp(hostname);
  const ips: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try { ips.push(...(await Deno.resolveDns(hostname, type))); } catch { /* record type may not exist */ }
  }
  return ips.length > 0 && ips.every(isCloudflareIp);
}

async function canOpenTcp(hostname: string, port: number, timeoutMs: number): Promise<boolean> {
  let timer: number | undefined;
  try {
    const conn = await Promise.race([
      Deno.connect({ hostname, port }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), timeoutMs); }),
    ]);
    conn.close();
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new Error("Upload service is not configured");
    const auth = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: userData, error: userError } = await auth.auth.getUser();
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(url, serviceKey);
    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (roleError || !isAdmin) return json({ error: "Admin access required" }, 403);
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "A valid article ID and PDF (maximum 30 MB) are required" }, 400);
    const { articleId, pdfBase64 } = parsed.data;

    const host = Deno.env.get("WWJMRD_FTP_HOST");
    const user = Deno.env.get("WWJMRD_FTP_USER");
    const password = Deno.env.get("WWJMRD_FTP_PASSWORD");
    if (!host || !user || !password) return json({ error: "FTP credentials are not configured" }, 500);

    const { data: article, error } = await supabase
      .from("articles")
      .select("id, title, reference_number")
      .eq("id", articleId)
      .maybeSingle();
    if (error) throw error;
    if (!article) return json({ error: "Article not found" }, 404);

    const fileName = buildFileName(article.title, article.reference_number);
    const bytes = Buffer.from(pdfBase64.replace(/^data:[^,]+,/, ""), "base64");
    if (bytes.subarray(0, 5).toString() !== "%PDF-") return json({ error: "The uploaded file is not a PDF" }, 400);

    const ftpUrl = new URL(/^ftps?:\/\//i.test(host) ? host : `ftp://${host}`);
    const ftpHost = ftpUrl.hostname;
    const ftpPort = ftpUrl.port ? Number(ftpUrl.port) : 21;

    // Cloudflare's proxy only carries website traffic, never FTP. If the saved
    // FTP address points at Cloudflare, every attempt hangs until it times out.
    const cf = await resolvesToCloudflare(ftpHost);
    if (cf) {
      console.error("Journal FTP host is behind Cloudflare", { articleId });
      return json({ error: CLOUDFLARE_FTP_ERROR, code: "FTP_HOST_PROXIED" }, 502);
    }

    // Fail fast when the server is unreachable instead of hanging the request.
    const reachable = await canOpenTcp(ftpHost, ftpPort, 10_000);
    if (!reachable) {
      console.error("Journal FTP host unreachable", { articleId, port: ftpPort });
      return json({
        error: `The WWJMRD file server did not answer on port ${ftpPort} within 10 seconds. Check that FTP is enabled on the hosting account and that the saved FTP address is the hosting server (not the website address). The article has not been published.`,
        code: "FTP_UNREACHABLE",
      }, 502);
    }

    const client = new FtpClient(25_000);
    client.ftp.verbose = false;
    let stage = "connection";
    try {
      await client.access({ host: ftpHost, port: ftpPort, user, password, secure: true });
      stage = "upload folder";
      // FTP accounts may be rooted at the site or its hosting home directory.
      // Only use an existing folder; ensureDir could silently create the wrong one.
      let found = false;
      for (const directory of ["/upload2", "/public_html/upload2", "/www/upload2", "/httpdocs/upload2"]) {
        try { await client.cd(directory); found = true; break; } catch { /* try the next existing web root */ }
      }
      if (!found) throw new Error("The existing website upload2 folder is not accessible to the FTP account");
      stage = "PDF transfer";
      await client.uploadFrom(Readable.from(bytes), fileName);
      const remoteSize = await client.size(fileName);
      if (remoteSize !== bytes.length) throw new Error("Uploaded PDF size does not match; retry the upload");
    } catch (error) {
      console.error("Journal FTP failure", { articleId, stage, message: error instanceof Error ? error.message : String(error) });
      // Do not return remote server messages, which may contain login details.
      return json({ error: `WWJMRD PDF upload failed during ${stage}. Check the FTP account, FTPS support, upload2 folder permissions and passive data ports. The article has not been published.` }, 502);
    } finally {
      client.close();
    }

    const publicUrl = `https://wwjmrd.com/upload2/${fileName}`;
    const publicResponse = await fetch(publicUrl, { headers: { Range: "bytes=0-4" }, signal: AbortSignal.timeout(15000) });
    if (!publicResponse.ok) throw new Error("FTP transfer completed but the PDF is not accessible in the website upload2 folder. Check the FTP website root.");
    const publicBytes = new Uint8Array(await publicResponse.arrayBuffer());
    if (new TextDecoder().decode(publicBytes.subarray(0, 5)) !== "%PDF-") throw new Error("FTP transfer completed but the website did not return a PDF. Check the FTP website root.");
    const { error: saveError, data: saved } = await supabase
      .from("articles")
      .update({ published_pdf_url: publicUrl })
      .eq("id", articleId).select("id").single();
    if (saveError || !saved) throw new Error("PDF uploaded but its article link could not be saved. Retry before publishing.");

    console.log("Uploaded formatted PDF to FTP", { articleId, fileName, size: bytes.length });
    return json({ success: true, fileName, url: publicUrl });
  } catch (err) {
    console.error("upload-article-pdf error", err);
    return json({ error: err instanceof Error ? err.message : "Upload failed" }, 500);
  }
});
