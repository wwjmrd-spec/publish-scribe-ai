import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { priceCart } from "./pricing.ts";

const fees = {
  indian_fee: 1199, indian_fast_track_fee: 500, indian_doi_fee: 500,
  international_fee: 29, international_fast_track_fee: 10, international_doi_fee: 10,
};

// Minimal stand-in for the database client: only the fee lookup is needed for
// a Fast Track cart, which has no article yet.
const sb = {
  from: () => ({ select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: fees }) }) }) }),
};

const fastTrack = [{ type: "article_fee" }, { type: "fast_track_fee" }, { type: "doi" }];

Deno.test("Fast Track with DOI totals Rs 2199 for Indian authors", async () => {
  const r = await priceCart(sb, "u", fastTrack, "INR");
  assertEquals(r.finalAmount, 2199);
});

Deno.test("Fast Track with DOI totals $49 for international authors", async () => {
  const r = await priceCart(sb, "u", fastTrack, "USD");
  assertEquals(r.finalAmount, 49);
});

Deno.test("Fast Track without DOI totals Rs 1699", async () => {
  const r = await priceCart(sb, "u", fastTrack.slice(0, 2), "INR");
  assertEquals(r.finalAmount, 1699);
});

Deno.test("A DOI fee without an article is rejected outside Fast Track", async () => {
  await assertRejects(() => priceCart(sb, "u", [{ type: "doi" }], "INR"), Error, "Invalid DOI item");
});
