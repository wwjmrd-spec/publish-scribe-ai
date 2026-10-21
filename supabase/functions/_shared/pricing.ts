// Server-side cart pricing. Every amount charged is derived here from the
// publication_fees table and server-validated ownership; client-supplied
// amounts and discounts are never trusted.

export type PayCurrency = "INR" | "USD" | "USDT";

export const PAYABLE_ARTICLE_STATUSES = [
  "submitted", "under_review", "ai_review_generated", "revision_requested",
  "revised_submitted", "revised_review_generated", "manuscript_accepted", "pending_fee",
  "failed_payment",
];

const ITEM_TYPES = [
  "article_fee", "fast_track_fee", "pro_subscription", "coauthor_certificate",
  "review_report", "article_edit", "doi", "legacy_doi",
] as const;
type ItemType = typeof ITEM_TYPES[number];

export interface CartItemInput {
  type: ItemType;
  articleId?: string;
  coAuthorId?: string;
  requestId?: string;
}

export interface PricedItem extends CartItemInput {
  price: number;
}

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function feeFor(fees: Record<string, any> | null, kind: string, currency: PayCurrency): number {
  const f = fees || {};
  const pick = (inr: number, usd: number) => {
    if (currency === "INR") return num(f[`indian_${kind}`], inr);
    if (currency === "USDT") return num(f[`usdt_${kind}`], num(f[`international_${kind}`], usd));
    return num(f[`international_${kind}`], usd);
  };
  switch (kind) {
    case "fee": return pick(2500, 79);
    case "fast_track_fee": return pick(500, 10);
    case "pro_fee": return pick(999, 19);
    case "coauthor_fee": return pick(500, 10);
    case "doi_fee": return pick(500, 10);
    default: throw new Error("Unknown fee");
  }
}

function sanitizeItems(raw: unknown): CartItemInput[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) throw new Error("No items provided");
  const isId = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
  return raw.map((i: any) => {
    if (!i || !ITEM_TYPES.includes(i.type)) throw new Error("Invalid cart item");
    const out: CartItemInput = { type: i.type };
    if (i.articleId != null) { if (!isId(i.articleId)) throw new Error("Invalid cart item"); out.articleId = i.articleId; }
    if (i.coAuthorId != null) { if (!isId(i.coAuthorId)) throw new Error("Invalid cart item"); out.coAuthorId = i.coAuthorId; }
    if (i.requestId != null) { if (!isId(i.requestId)) throw new Error("Invalid cart item"); out.requestId = i.requestId; }
    return out;
  });
}

type DiscountPart = "article_fee" | "pro_plan" | "review_report" | "doi" | "other";
const ALL_PARTS: DiscountPart[] = ["article_fee", "pro_plan", "review_report", "doi", "other"];
function parseAppliesTo(value?: string | null): DiscountPart[] {
  const v = (value || "all").trim();
  if (v === "all") return [...ALL_PARTS];
  if (v === "both") return ["article_fee", "pro_plan"];
  const parts = v.split(",").map((p) => p.trim()).filter((p): p is DiscountPart => (ALL_PARTS as string[]).includes(p));
  return parts.length ? parts : [...ALL_PARTS];
}
function positionAllowed(index: number, limit?: string | null) {
  switch ((limit || "any").trim()) {
    case "first": return index === 0;
    case "second": return index === 1;
    case "first_two": return index < 2;
    default: return true;
  }
}
function partOf(type: ItemType): DiscountPart {
  if (type === "article_fee" || type === "fast_track_fee") return "article_fee";
  if (type === "pro_subscription") return "pro_plan";
  if (type === "review_report") return "review_report";
  if (type === "doi" || type === "legacy_doi") return "doi";
  return "other";
}

/**
 * Validate every cart item against the caller's own records and price it from
 * server fees. Throws on any item the caller may not buy.
 */
export async function priceCart(
  sb: any,
  userId: string,
  rawItems: unknown,
  currency: PayCurrency,
  discountCode?: string | null,
) {
  const items = sanitizeItems(rawItems);
  const { data: fees } = await sb.from("publication_fees").select("*").limit(1).maybeSingle();

  const priced: PricedItem[] = [];
  const hasFastTrack = items.some((i) => i.type === "fast_track_fee");
  const seen = new Set<string>();

  for (const item of items) {
    const key = `${item.type}:${item.articleId || ""}:${item.coAuthorId || ""}:${item.requestId || ""}`;
    if (seen.has(key)) throw new Error("Duplicate cart item");
    seen.add(key);

    let price = 0;
    switch (item.type) {
      case "article_fee": {
        if (item.articleId) {
          const { data: art } = await sb.from("articles").select("id, author_id, status")
            .eq("id", item.articleId).eq("author_id", userId).maybeSingle();
          if (!art) throw new Error("Article not found or not yours");
          if (!PAYABLE_ARTICLE_STATUSES.includes(art.status)) throw new Error("This article fee is not payable");
        } else if (!hasFastTrack) {
          throw new Error("Invalid article fee item");
        }
        price = feeFor(fees, "fee", currency);
        break;
      }
      case "fast_track_fee":
        price = feeFor(fees, "fast_track_fee", currency);
        break;
      case "pro_subscription":
        if (priced.some((p) => p.type === "pro_subscription")) throw new Error("Duplicate cart item");
        price = feeFor(fees, "pro_fee", currency);
        break;
      case "coauthor_certificate": {
        if (!item.coAuthorId || !item.articleId) throw new Error("Invalid co-author certificate data");
        const { data: art } = await sb.from("articles").select("id").eq("id", item.articleId).eq("author_id", userId).maybeSingle();
        if (!art) throw new Error("Article not found or not yours");
        const { data: ca } = await sb.from("co_authors").select("id").eq("id", item.coAuthorId).eq("article_id", item.articleId).maybeSingle();
        if (!ca) throw new Error("Co-author not found for this article");
        price = feeFor(fees, "coauthor_fee", currency);
        break;
      }
      case "review_report":
      case "article_edit": {
        if (!item.articleId) throw new Error("Invalid cart item");
        const { data: art } = await sb.from("articles").select("id").eq("id", item.articleId).eq("author_id", userId).maybeSingle();
        if (!art) throw new Error("Article not found or not yours");
        price = currency === "INR" ? 100 : 5;
        break;
      }
      case "doi": {
        if (!item.articleId) {
          // Fast Track pays before the article exists; the DOI is linked to the
          // new article afterwards by claim_fast_track_payment.
          if (!hasFastTrack) throw new Error("Invalid DOI item");
          price = feeFor(fees, "doi_fee", currency);
          break;
        }
        const { data: art } = await sb.from("articles").select("id, doi_paid").eq("id", item.articleId).eq("author_id", userId).maybeSingle();
        if (!art) throw new Error("Article not found or not yours");
        if (art.doi_paid) throw new Error("The DOI fee for this article is already paid");
        price = feeFor(fees, "doi_fee", currency);
        break;
      }
      case "legacy_doi": {
        if (!item.requestId) throw new Error("Invalid DOI request");
        const { data: r } = await sb.from("legacy_doi_requests").select("id, status").eq("id", item.requestId).eq("user_id", userId).maybeSingle();
        if (!r) throw new Error("DOI request not found");
        if (r.status === "paid" || r.status === "completed") throw new Error("This DOI request is already paid");
        price = feeFor(fees, "doi_fee", currency);
        break;
      }
    }
    priced.push({ ...item, price });
  }

  const subtotal = round2(priced.reduce((s, i) => s + i.price, 0));
  let discount = 0;
  let appliedCode: string | null = null;

  const code = typeof discountCode === "string" ? discountCode.trim() : "";
  if (code && code !== "PRO_SUBSCRIPTION") {
    const { data: dc } = await sb.from("discount_codes").select("*").ilike("code", code).eq("is_active", true).maybeSingle();
    const now = new Date();
    const effCurrency = currency === "USDT" ? "USD" : currency;
    const valid = dc
      && now >= new Date(dc.start_date) && now <= new Date(dc.end_date)
      && (dc.currency === "BOTH" || dc.currency === effCurrency || dc.currency === "USDT")
      && !(dc.usage_limit && (dc.used_count || 0) >= dc.usage_limit)
      && !(Number(dc.min_cart_value || 0) > 0 && subtotal < Number(dc.min_cart_value));
    let perUserOk = true;
    if (valid && Number(dc.max_uses_per_user || 0) > 0) {
      const { data: reds } = await sb.from("discount_redemptions").select("payment_id")
        .eq("discount_code_id", dc.id).eq("user_id", userId);
      const ids = (reds || []).map((r: any) => r.payment_id).filter(Boolean);
      let used = 0;
      if (ids.length) {
        const { count } = await sb.from("payments").select("id", { count: "exact", head: true })
          .in("id", ids).eq("payment_status", "success");
        used = count || 0;
      }
      perUserOk = used < Number(dc.max_uses_per_user);
    }
    if (valid && perUserOk) {
      const parts = parseAppliesTo(dc.applies_to);
      const restricted = (dc.article_position_limit || "any") !== "any" || !!dc.specific_article_ids?.length;
      // Article positions are counted across the author's payable articles, oldest first.
      let eligibleArticleIds: Set<string> | null = null;
      if (restricted) {
        const { data: pending } = await sb.from("articles").select("id, created_at")
          .eq("author_id", userId).in("status", PAYABLE_ARTICLE_STATUSES).order("created_at", { ascending: true });
        const selected = new Set(priced.filter((p) => p.type === "article_fee" && p.articleId).map((p) => p.articleId));
        eligibleArticleIds = new Set(
          (pending || [])
            .filter((a: any, idx: number) => selected.has(a.id) && positionAllowed(idx, dc.article_position_limit))
            .filter((a: any) => !dc.specific_article_ids?.length || dc.specific_article_ids.includes(a.id))
            .map((a: any) => a.id),
        );
      }
      const base = priced.reduce((s, p) => {
        const part = partOf(p.type);
        if (!parts.includes(part)) return s;
        if (eligibleArticleIds && (p.type === "article_fee" || p.type === "doi")) {
          return p.articleId && eligibleArticleIds.has(p.articleId) ? s + p.price : s;
        }
        if (eligibleArticleIds && (p.type === "legacy_doi" || p.type === "fast_track_fee")) return s;
        return s + p.price;
      }, 0);
      discount = dc.discount_type === "percentage"
        ? (base * Number(dc.discount_value)) / 100
        : Math.min(Number(dc.discount_value), base);
      discount = round2(Math.max(0, Math.min(discount, subtotal)));
      if (discount > 0) appliedCode = dc.code;
    }
  }

  const finalAmount = round2(subtotal - discount);
  if (finalAmount <= 0) throw new Error("Invalid amount");

  const paymentItems = priced.map(({ price, ...rest }) => ({ ...rest, amount: price }));
  const articleIds = priced.filter((p) => p.type === "article_fee" && p.articleId).map((p) => p.articleId as string);
  return { items: priced, paymentItems, articleIds, subtotal, discount, finalAmount, discountCode: appliedCode };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
