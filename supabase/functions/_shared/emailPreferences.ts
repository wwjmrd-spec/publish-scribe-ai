// Shared helpers for email preference checks + unsubscribe token URLs.
// Used by any send-* edge function that emits opt-outable emails.

const SITE_URL = Deno.env.get("SITE_URL") || "https://wwjmrdai.online";

export type EmailCategory =
  | "fee_reminder"
  | "revision_requested"
  | "marketing"
  | "announcements";

export async function isCategoryEnabled(
  supabase: any,
  authorId: string,
  category: EmailCategory,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("is_email_category_enabled", {
      _author_id: authorId,
      _category: category,
    });
    if (error) {
      console.error("[emailPreferences] rpc error", error.message);
      return true; // fail-open
    }
    return data !== false;
  } catch (e) {
    console.error("[emailPreferences] rpc threw", e);
    return true;
  }
}

/** Fetches or lazily creates the per-author, per-category unsubscribe token. */
export async function getUnsubscribeUrl(
  supabase: any,
  authorId: string,
  category: EmailCategory,
): Promise<string> {
  const { data: existing } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("author_id", authorId)
    .eq("category", category)
    .maybeSingle();

  let token = existing?.token as string | undefined;
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabase
      .from("email_unsubscribe_tokens")
      .insert({ author_id: authorId, category, token });
    if (error && !String(error.message).includes("duplicate")) {
      console.error("[emailPreferences] token insert error", error.message);
    }
    // If we hit a duplicate race, re-read.
    if (error) {
      const { data: again } = await supabase
        .from("email_unsubscribe_tokens")
        .select("token")
        .eq("author_id", authorId)
        .eq("category", category)
        .maybeSingle();
      token = again?.token || token;
    }
  }
  return `${SITE_URL}/unsubscribe?token=${token}`;
}

export const CATEGORY_LABEL: Record<EmailCategory, string> = {
  fee_reminder: "publication fee reminder",
  revision_requested: "manuscript revision reminder",
  marketing: "marketing update",
  announcements: "announcement",
};
