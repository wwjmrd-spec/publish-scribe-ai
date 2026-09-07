// Admin tool: creates a new author user (auth + profile + role).
// Generates a temporary password if none supplied, flags the account so the
// author is forced to reset their password on first login, and emails them
// the temp credentials + a password-reset link.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BodySchema = z.object({
  email: z.string().email(),
  // Password is optional now — if omitted we generate a temporary one.
  password: z.string().min(8).max(128).optional(),
  full_name: z.string().min(1).max(100),
  first_name: z.string().max(100).optional().default(""),
  last_name: z.string().max(100).optional().default(""),
  country: z.string().min(1).max(100).default("Unknown"),
  affiliation: z.string().max(200).optional().default(""),
  is_indian: z.boolean().optional(),
  send_credentials_email: z.boolean().optional().default(true),
});

function generateTempPassword(): string {
  // 12-char temp password: 1 upper, 1 lower, 1 digit, 1 symbol, rest random.
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = 0; i < 8; i++) chars.push(pick(all));
  // shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const sbUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(url, serviceKey);
    const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const b = parsed.data;
    const isIndian = b.is_indian ?? b.country.toLowerCase() === "india";
    const tempPassword = b.password || generateTempPassword();
    const isGeneratedTemp = !b.password;

    // Create the auth user. email_confirm: true so the author can immediately
    // sign in with the temporary password. They'll still be forced to reset
    // it via the must_reset_password metadata flag.
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: b.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: b.full_name,
        country: b.country,
        affiliation: b.affiliation,
        must_reset_password: isGeneratedTemp,
        created_by_admin: userData.user.id,
      },
    });
    if (createErr || !created?.user) return json({ error: createErr?.message || "Failed to create user" }, 400);

    const newId = created.user.id;
    // Trigger handle_new_user creates profile + role. Ensure consistency:
    await sb.from("profiles").upsert({
      id: newId,
      email: b.email,
      full_name: b.full_name,
      country: b.country,
      affiliation: b.affiliation,
      is_indian: isIndian,
    });
    await sb.from("user_roles").upsert({ user_id: newId, role: "author" }, { onConflict: "user_id,role" });

    // Generate a password recovery / verify link the author can use to set
    // their own password and verify the email at the same time.
    let resetLink = "";
    try {
      const origin = req.headers.get("origin") || "https://wwjmrdai.online";
      const { data: linkData } = await sb.auth.admin.generateLink({
        type: "recovery",
        email: b.email,
        options: { redirectTo: `${origin}/reset-password` },
      });
      resetLink = linkData?.properties?.action_link || "";
    } catch (e) {
      console.error("generateLink failed", e);
    }

    // Fire-and-forget welcome email with temp credentials + reset link.
    if (b.send_credentials_email) {
      try {
        await sb.functions.invoke("send-email", {
          body: {
            to: b.email,
            template: "admin-created-credentials",
            data: {
              userName: b.full_name,
              authorEmail: b.email,
              tempPassword,
              resetUrl: resetLink,
              loginUrl: `${req.headers.get("origin") || "https://wwjmrdai.online"}/auth`,
              isGeneratedTemp,
            },
          },
          headers: { Authorization: `Bearer ${serviceKey}` },
        });
      } catch (e) {
        console.error("Welcome email failed (non-fatal)", e);
      }
    }

    return json({
      ok: true,
      user_id: newId,
      temp_password: isGeneratedTemp ? tempPassword : null,
      reset_link: resetLink || null,
      must_reset_password: isGeneratedTemp,
    });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
