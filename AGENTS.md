# Project Architecture Rules

- Store acceptance letters as immutable server-generated PDFs with owner/admin read access and server-validated admin generation; downloads reuse get-document-url to prevent public document access.
- Require successful journal PDF upload before publishing metadata; never swallow upload errors or use an old PDF as a silent fallback.
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
