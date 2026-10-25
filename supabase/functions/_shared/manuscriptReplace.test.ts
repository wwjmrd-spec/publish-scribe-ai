import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canReplaceManuscript, isFormattingDone, revokesAuthorPermission } from "./manuscriptReplace.ts";

Deno.test("admin can always replace the manuscript", () => {
  assertEquals(canReplaceManuscript({ isAdmin: true, isOwner: false, allowedByAdmin: false }), true);
});

Deno.test("author can replace only when the admin allowed it", () => {
  assertEquals(canReplaceManuscript({ isAdmin: false, isOwner: true, allowedByAdmin: false }), false);
  assertEquals(canReplaceManuscript({ isAdmin: false, isOwner: true, allowedByAdmin: true }), true);
});

Deno.test("another author can never replace the manuscript", () => {
  assertEquals(canReplaceManuscript({ isAdmin: false, isOwner: false, allowedByAdmin: true }), false);
});

Deno.test("formatted article needs a manual re-format; unformatted one formats automatically", () => {
  assertEquals(isFormattingDone("ready_for_review", false), true);
  assertEquals(isFormattingDone("approved", false), true);
  assertEquals(isFormattingDone("failed", false), false);
  assertEquals(isFormattingDone(null, false), false);
});

Deno.test("author permission is used up after one upload, admin's is not", () => {
  assertEquals(revokesAuthorPermission(false), true);
  assertEquals(revokesAuthorPermission(true), false);
});
