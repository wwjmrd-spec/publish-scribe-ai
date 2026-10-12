# Roadmap

- [ ] Add one-click admin acceptance letter generation and admin/author PDF downloads.
- [ ] Diagnose and repair journal PDF upload failures without publishing after a failed upload.
- [ ] Verify acceptance letter creation/download and upload error handling.

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
