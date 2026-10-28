# Project Architecture Rules

- Build WWJMRD `authors`/`references` arrays only via publish-to-wwjmrd/wwjmrdPayload.ts (co-authors ordered by co_authors.sort_order, references from saved formatted_content) and send them as JSON strings inside the existing form-urlencoded request, because the PHP API reads form fields and batch-inserted co-authors share created_at.

- Store acceptance letters as immutable server-generated PDFs with owner/admin read access and server-validated admin generation; downloads reuse get-document-url to prevent public document access.
- Publish to WWJMRD with the journal-hosted PDF from a confirmed upload; only after an upload failure and explicit admin confirmation may publish-to-wwjmrd use a signed Cloud PDF link (allowCloudPdf), never silently.
- Confirm journal PDF uploads from published_pdf_uploaded_at when the browser loses the reply, because large uploads can finish server-side after the client connection drops.
- Reuse DeleteCoAuthorButton with saved-row confirmation and owner/admin RLS for co-author deletion so all views invalidate consistently and cascade certificate removal is explicit.
- Queue DOI-fee acceptance emails on the persisted free-status transition and claim each event server-side before sending so manual and automatic acceptance share retry-safe delivery.
- Generate article status filter options from ARTICLE_STATUS_LABELS so every lifecycle state remains available.

- Preserve semantic inline scientific markup (`sub`, `sup`, and equation spans) throughout formatting, pagination, preview, and export because flattening paragraph text corrupts manuscripts.
- Re-format requests explicitly bypass the completed-format idempotency guard, while automatic formatting remains idempotent to prevent duplicate jobs.
- Record manual DOI payments through the admin-validated atomic database function, preserving article status, to prevent partial payment/assignment updates.
- Derive author DOI visibility with getAuthorDoiState so assigned numbers do not bypass payment and publication requirements.
- Persist formatted manuscript writes through saveFormattedArticle with a dedicated deadline and saved-row confirmation because large HTML updates can exceed short dashboard request timeouts.
- Link pre-paid Fast Track payments (including the optional DOI item) to the new article through claim_fast_track_payment, because the payment is made before the article row exists and authors cannot set doi_paid themselves.
- Preflight journal FTP uploads (Cloudflare-proxied host, TCP reachability) before connecting, because proxied or unreachable hosts otherwise hang until the browser drops the request.
- Send PBSZ 0 / PROT P manually after FTPS login and take the upload folder and its public URL base from config, because basic-ftp skips PROT P on Deno TLS sockets (data channel then fails) and the FTP user's root differs per hosting account.
- Number every formatted PDF/Word export and the journal upload from the article's saved page_number range (startPageFromRange), because the approved final version's page numbers must never change after approval.
- Store the main author's name and affiliation as printed on the article in articles.author_name/author_affiliation and use them (with co_authors) on certificates, letters and formatted output, because the submitting account can be a different person from the article's authors.
- Re-capitalize article titles only through supabase/functions/_shared/academicTitle.ts (shared by browser and edge functions; output may differ from input only in letter case/whitespace) and keep the submitted title in articles.original_title, because titles must stay restorable and AI may identify terms but never respell them.
- Replace manuscript files only through the replace-manuscript function and replace_article_manuscript (sets app.manuscript_replace so resubmission triggers skip the review restart), because an editorial file swap must keep status/reviews while author resubmissions still restart the flow; author access is a one-time, admin-granted allow_manuscript_replace flag protected by trigger.
- Parse manuscript tables only through supabase/functions/_shared/tableGrid.ts (keeps rowspan/colspan and empty boxes, pads to a rectangle) and split tables in pagination only at page ends by whole rowspan groups, because dropping spans shifts cell content and per-fragment re-splitting broke tables into many pieces.
