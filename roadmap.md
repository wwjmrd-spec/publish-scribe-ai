# Roadmap

- [x] Diagnose "Publish to WWJMRD failed: Failed to send a request": saved FTP host points to Cloudflare (FTP impossible); upload now fails fast with a clear fix message.
- [ ] Journal PDF FTP upload working; blocked on the admin setting the ftp DNS record to DNS-only or providing the hosting server's direct IP.
- [x] Fast Track total includes DOI fee (ticked by default, can be unticked) with polite no-DOI notice; DOI fee linked to the new article after payment.
- [x] Polite "published without a DOI" note in the author's DOI fee box.

- [x] Add one-click admin acceptance letter generation and admin/author PDF downloads; deployed letter and download functions.
- [x] Stop publication after failed PDF transfers; add admin validation, secure FTP, existing website-folder discovery, transfer verification and actionable errors.
- [x] Verify PDF generation, long-title pagination and upload failure handling with four passing tests; preview builds successfully.
- [ ] Verify live acceptance letter creation/download and diagnose the actual FTP response; blocked by article-service requests timing out even with a 90-second deadline.

- [x] Allow admins and authors to delete co-authors; verified owner/admin deletion permissions and a real temporary co-author add/delete flow.
- [x] Queue personalized mandatory DOI-fee requests on new free-article acceptance (India Rs 500; other countries USD 10), with delivery retries and author email preferences respected.
- [x] Include every article status in admin filters and search articles by author email and status.
- [x] Search authors by referral code.
- [x] Verify signed-in controls, database trigger/permissions, and ten DOI/email tests; no acceptance status changed or real fee-request email sent during testing.

- [x] Fix formatted article save timeouts; four tests pass and a simulated 14-second save succeeds in the browser without modifying the manuscript.

- [x] Allow admins and authors to add co-authors while editing article details.
- [x] Use and display separate first-name and last-name fields for co-authors.
- [x] Guarantee generated review-report scores are never below 70%.
- [x] Start article formatting automatically after payment succeeds.
- [x] Verify database rules, affected screens, and automation paths.

- [x] Preserve equations, subscripts, and superscripts during article formatting.
- [x] Add equation, subscript, and superscript controls for admin and author editing.
- [x] Add a full-screen editing mode with all existing controls.
- [x] Verify editing, pagination, preview, and PDF/Word export behavior.
- [x] Make Re-format rebuild completed formatted articles while keeping automatic formatting idempotent.
- [x] Add manual DOI payments and assignment without changing publication status.
- [x] Rename Get DOI and gate author DOI visibility on payment and publication.
- [x] Verify DOI visibility with five tests and the manual payment form in the browser; no real payment recorded.
