// Admin tool: creates a new author user (auth + profile + role).
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
  password: z.string().min(8).max(128),
  full_name: z.string().min(1).max(100),
  country: z.string().min(1).max(100).default("Unknown"),
  affiliation: z.string().max(200).optional().default(""),
  is_indian: z.boolean().optional(),
});

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

    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: b.email,
      password: b.password,
      email_confirm: true,
      user_metadata: { full_name: b.full_name, country: b.country, affiliation: b.affiliation },
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

    return json({ ok: true, user_id: newId });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
