# Plan: Publications, Editor, Referral Overhaul

## 1. Recent Publications (home/public page)
- New section listing published articles with a **Free** / **Paid** badge.
- Each card links to the article abstract page (`/articles/:reference` or existing public route — confirm path during implementation).
- DB: add `published_tier text` to `articles` (values: `free` | `paid`), default derived from existing logic (page_count <= 2 → free, else paid). Admin can override in Article Detail.
- Admin UI: dropdown in `AdminArticleDetail.tsx` to set Free / Paid tag.

## 2. PDF Export — fix blur & reduce file size
- Current issue: `html2canvas` → JPEG @ scale 2 produces large, blurry pages.
- Fix in `src/lib/exportFormattedArticle.ts`:
  - Render text directly via jsPDF `html` API (or use vector text where possible) instead of rasterising each page.
  - If rasterising must stay, drop scale to 1.5 and use JPEG quality 0.85 with sharper font rendering (set `letterRendering: true`, explicit `width`/`height` in mm).
- Target: clearer text + ~40–60% smaller files.

## 3. Article Format pulls author info from Article Detail
- In format-article flow, replace the manual author block with values read from `articles` row (`author_name`, `affiliation`, `country`, co-authors) — **exclude email**.
- File: `supabase/functions/format-article/index.ts` and any client preview in `AdminFormatting.tsx`.

## 4. Editor fixes & additions (`src/components/ui/RichTextEditor.tsx`)
- **Fix Clear Red Highlight** button — currently no-op. Implement removal of `<span style="background:...red...">` / `mark` wrappers in the current selection (or whole doc).
- **Table tools**: add buttons to (a) insert row above/below, (b) insert column left/right, (c) delete row/column ("eraser"), (d) toggle header row.

## 5. Admin: reassign article author
- In `AdminArticleDetail.tsx`, show the submitting author account (already partly visible) and add a **Change Author** action.
- Backend: new edge function `admin-reassign-article` (admin only) that updates `articles.author_id`, `author_name`, `author_email` from selected profile, logs in `payment_activity`/audit.

## 6. Referral program — % based
- New rules:
  - Referrer earns **15% of friend's publication fee** as a discount code.
  - Referred friend earns **10% off** their publication fee when applying the referrer's code at checkout.
  - Applies to INR and USD equally; computed in the friend's own currency.
  - Codes apply automatically to the article's publication fee at checkout (not just stored in wallet).
- DB / logic changes:
  - Change `check_referral_reward()` trigger: instead of fixed tiers (₹500/$10 etc.), compute `discount_value = round(fee_amount * 0.15)` from the friend's paid invoice in `payments` and create a percent or fixed code for the referrer.
  - Referred friend's `WELCOME-` code becomes a **10% percent code** valid on their next publication fee.
- UI:
  - `Rewards.tsx`: replace tier ladder with: "Earn 15% back for every friend you refer. Friends get 10% off their publication fee."
  - Show earned-amount history (₹/$) per referral.
  - Remove "tier" copy from `useReferral.ts`.
- Checkout: ensure `lookup_discount_code` + cart applies percent discount on publication fee row (already supports `percent` type — verify).

## Technical notes
- Migration adds: `articles.published_tier text`, updates `check_referral_reward` function, adds `discount_codes.discount_type='percent'` rows.
- Edge function deploy: `format-article`, `admin-reassign-article` (new).
- No new buckets/secrets needed.

## Out of scope / confirm
- "Recent Publications" placement: home page hero section vs. a dedicated `/publications` route? **Default: add to home page, plus full list at `/publications`.**
- PDF target page size limit (e.g. < 2 MB for 10 pages)? **Default: aim for ~150 KB/page.**

Reply "go" to build, or tell me what to adjust.
