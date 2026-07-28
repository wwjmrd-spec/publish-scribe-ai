## Goal

Give authors an admin-style article workspace: a compact list of their own articles, a full detail page per article, and a controlled edit workflow with quotas, paid unlocks for published articles, admin notification, and an admin approve-and-republish step.

## 1. Author "My Articles" list becomes compact

Rewrite the list rows to show only: title, submission date + time, status badge, reference number. Clicking a row opens `/author/articles/:id`. Keep pagination and search. All the current per-article action panels move into the detail page.

## 2. New author article detail page (`/author/articles/:id`)

Read-only sections mirroring the admin page, but scoped to the article's own author:
- Header: title, reference number, status, submission date, lock state.
- Article details: title, abstract, keywords, subject, country, publication type.
- Authors: corresponding author + co-authors.
- Documents: manuscript download, review report (existing quota/pay logic reused), certificate, copyright form download + upload/submit, galley proof review (reuse `GalleyProofReviewSection`), publication card (reuse `PublicationCard`).
- No admin-only tools (no status control, formatting, AI reanalyse, publishing, fee override).

## 3. Edit permission rules

An "Edit Details" mode is enabled only when all hold:
- `allow_author_edit` is true (admin master switch, already exists), AND
- status is `submitted` **or** a galley proof is awaiting author review (`galley_proof_sent` / `galley_proof_revised`), OR
- status is `published`/`published_to_wwjmrd` **and** the author has a paid edit credit remaining.

Author/co-author identity edits (names, emails, affiliations) are allowed **once** per article. After that save, the article's author-edit permission is auto-disabled and the UI shows: "You have used your one-time author details change. Please contact the admin to request another edit." Admin can re-enable from the existing toggle in the admin panel.

A notice block renders directly above the Save Changes button describing the current permission state and remaining allowances.

## 4. Paid editing for published articles

- Fee: ₹100 (INR) / $5 (USD), currency picked from the author's India flag, same as existing fee logic.
- Clicking Edit on a published article opens a payment dialog reusing the existing Razorpay/PayPal `usePayment` flow with a new item type `article_edit`.
- On verified payment only, the article gets **2 edit saves** credited. Editing stays locked until the payment row is confirmed successful.
- Credits decrement per save; at zero the article re-locks and the notice explains how to buy again.
- Admin can always edit, and can grant editing free of charge from the admin panel at any time.

## 5. Author revision → admin approval (mirrors galley proof)

- Author's edits are applied to a **revision copy** of the formatted article HTML, with every changed passage wrapped in a red highlight marker so differences are obvious.
- Saving submits the revision for review: the article moves to status **Update Under Process** for published articles (or stays in its normal flow for pre-publication edits) and admins get a notification plus an entry in the admin article detail page, in a new "Author Update Request" panel with Approve / Reject, identical in feel to the galley proof revision review.
- On Approve, admin gets an **Update & Publish** button that:
  - applies the revision HTML into the formatted article (highlights stripped),
  - regenerates the certificate and publication card with the new details,
  - reuses the existing publication details (volume/issue/pages/DOI) with an option to edit them,
  - sets status to **Updated & Published**.

## 6. Data model changes (single migration)

On `articles`:
- `author_edits_remaining int default 0` — paid edit credits.
- `author_details_changed_once boolean default false`.
- `author_update_html text`, `author_update_submitted_at timestamptz`, `author_update_status text` (`none | pending | approved | rejected`), `author_update_notes text`.

New enum values on `article_status`: `update_under_process`, `updated_published`, with labels and badge colours in `src/lib/articleStatus.ts`.

Trigger: notify all admins on any author-submitted update request or author-detail change.

New edge function `create-article-edit-order` + handling in `verify-payment` to credit 2 edits on success.

## Technical notes

- New files: `src/pages/author/ArticleDetail.tsx`, `src/components/articles/AuthorEditPanel.tsx`, `src/components/articles/ArticleEditPaymentDialog.tsx`, `src/components/admin/AuthorUpdateReviewSection.tsx`.
- Edited: `MyArticles.tsx` (list only), `App.tsx` (route), `AdminArticleDetail.tsx` (review panel + update & publish), `articleStatus.ts`, `usePayment.ts` (new item type), `verify-payment`, `generate-certificate` reuse.
- RLS: authors can only update their own article rows and only the revision/detail columns; credit and permission columns are written server-side by the payment verification function.
