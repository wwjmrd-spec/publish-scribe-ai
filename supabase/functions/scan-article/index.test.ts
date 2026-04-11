import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";

import { estimatePageCount, resolveFinalPageCount } from "./index.ts";

Deno.test("estimatePageCount respects explicit WWJMRD tilde page markers", () => {
  const text = `Journal Header ~ 1 ~\n${"academic content ".repeat(300)}\nJournal Header ~ 8 ~`;
  assertEquals(estimatePageCount(text), 8);
});

Deno.test("resolveFinalPageCount trusts DOCX metadata over inflated AI guesses", () => {
  assertEquals(
    resolveFinalPageCount({ aiPageCount: 12, estimatedPageCount: 8, docxPageCount: 8 }),
    8,
  );
});

Deno.test("resolveFinalPageCount rejects inflated AI counts when they exceed tolerance", () => {
  assertEquals(
    resolveFinalPageCount({ aiPageCount: 12, estimatedPageCount: 8, docxPageCount: null }),
    8,
  );
});