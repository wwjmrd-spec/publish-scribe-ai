# Implementation Plan

This is a large multi-part request. I'll split it into 4 workstreams and ship in order.

## 1. Fix A4 / PDF pagination bug (one-word-per-line)

**Root cause**: In `formattedArticlePagination.ts`, when a paragraph doesn't fit on a page, the splitter falls back to splitting by individual words and wraps each word in its own `<p>` element. That's why the preview shows "implications / follow / directly. / If / burnout…" stacked vertically.

**Fix**: Rewrite the overflow splitter to:
- Measure how many words fit using a hidden measurement node with the same font/width as the page content area.
- Emit at most 2 fragments per paragraph: the words that fit on the current page (joined as one `<p>`) and the remainder (one `<p>`) pushed to the next page.
- Never wrap single words in their own block. Keep figures and tables atomic (already done).
- Apply the same logic to headings (push whole heading to next page if it doesn't fit; never split).

Also remove the lingering inline `background` highlight that's coming from the editor's selection styles leaking into the printed HTML (`ww-highlight` class) so PDF/preview are clean.

## 2. Galley Proof: PDF only

- `SendGalleyProofDialog`: remove the Word upload field; only PDF upload allowed.
- `AdminGalleyProofs` list: keep "Word" download button only when `galley_proof_word_url` already exists from legacy records; new sends won't populate it.
- Author side (`GalleyProofReviewSection`): hide the "Download Word" button; "Upload Revised File" continues to accept `.docx`/`.pdf` (Word allowed only for revisions).

## 3. Galley Proof annotation workflow

New flow:
1. Author opens galley proof → sees inline PDF viewer with a **"Edit / Annotate Galley Proof"** button.
2. Annotation UI: PDF rendered with `react-pdf`; author drags to select a region on a page; a comment panel slides in on the right where they type the requested change; multiple annotations supported; "Send to Admin" submits.
3. Annotations are stored in a new `galley_proof_annotations` table:
   ```
   id, article_id, author_id, page_number, x, y, width, height,
   selected_text, comment, status ('pending'|'applied'|'rejected'),
   admin_note, created_at, resolved_at
   ```
4. Admin sees a new tab on `AdminGalleyProofs` → "Annotations" → list of pending annotations per article with thumbnail crop of the highlighted region + comment. Buttons: **Apply** (opens the formatted-article editor pre-scrolled to that text), **Reject** (with note), **Mark Applied**.
5. When admin uploads the final corrected PDF + clicks **"Mark as Ready to Publish"**, annotations are auto-resolved and the article moves to the publication form step.

Status column added to `articles`: `galley_proof_status` gains `revision_requested` (annotations pending) and `ready_to_publish`.

## 4. Publication form in Publish Queue

New page: `src/pages/admin/AdminPublicationForm.tsx` reachable from `AdminPublishQueue` via "Prepare Publication" button on each ready-to-publish article.

Form fields (auto-filled from article + editable):
- Article Title
- Correspondence Author Name
- Co-Authors (comma-separated)
- Country
- Subject
- Description (short pitch)
- Keywords
- Year & Month
- DOI
- Abstract

Plus the final publish-ready PDF download button. "Copy All as JSON" and "Copy field-by-field" buttons so admin can paste into the WWJMRD WordPress form. Saved to new `publication_form_data` table for record.

## Files to add / edit

**New**
- `src/components/articles/GalleyProofAnnotator.tsx` (PDF + drag-to-highlight + comment panel)
- `src/components/admin/GalleyProofAnnotationsPanel.tsx`
- `src/pages/admin/AdminPublicationForm.tsx`
- Migration: `galley_proof_annotations` table + `publication_form_data` table + extra status values

**Edit**
- `src/lib/formattedArticlePagination.ts` — fix overflow splitter
- `src/components/admin/SendGalleyProofDialog.tsx` — remove Word
- `src/components/articles/GalleyProofReviewSection.tsx` — hide Word download, open annotator
- `src/pages/admin/AdminGalleyProofs.tsx` — annotations tab, hide Word for new
- `src/pages/admin/AdminPublishQueue.tsx` — "Prepare Publication" button → route to form
- `src/App.tsx` — new route

## Ordering

1. Land pagination fix + PDF-only galley change first (small, immediate win, both visible to user now).
2. Land publication form page (independent, no PDF tooling).
3. Land annotation workflow last (needs `react-pdf` + new tables + new admin UI; biggest piece).

Approve and I'll execute steps 1 + 2 + 4 (migration) in this turn, then step 3 (annotation UI) in the follow-up so we can verify each piece. Or reply "all at once" to ship everything in a single pass.
