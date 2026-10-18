// Caller authentication for privileged edge functions.
// - internal: another edge function calling with the service-role key
// - cron:     a scheduled job sending the vault-held x-cron-secret header
// - admin:    a signed-in user with the admin role
// - user:     any other signed-in user (only returned when allowUser is set)

export type Caller =
  | { kind: "internal" }
  | { kind: "cron" }
  | { kind: "admin"; userId: string }
  | { kind: "user"; userId: string };

export async function authorizeCaller(
  req: Request,
  serviceClient: any,
  opts: { allowCron?: boolean; allowUser?: boolean } = {},
): Promise<Caller | null> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();

  if (token && serviceKey && token === serviceKey) return { kind: "internal" };

  const cronSecret = req.headers.get("x-cron-secret");
  if (opts.allowCron && cronSecret) {
    const { data, error } = await serviceClient.rpc("verify_cron_secret", { p_secret: cronSecret });
    if (!error && data === true) return { kind: "cron" };
  }

  if (!token) return null;
  const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return null;

  const { data: isAdmin } = await serviceClient.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin === true) return { kind: "admin", userId };
  return opts.allowUser ? { kind: "user", userId } : null;
}

export function unauthorized(corsHeaders: Record<string, string>, status = 401) {
  return new Response(JSON.stringify({ error: status === 403 ? "Forbidden" : "Unauthorized" }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
