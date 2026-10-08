# Roadmap

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
