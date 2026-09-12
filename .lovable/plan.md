# Daily Article Submission Limits

## What will change
- Set a default limit of **5 new articles per author during any rolling 24-hour period**.
- Count only newly created articles. Manuscript revisions and replacements will not consume the limit.
- Show authors their current usage and remaining submissions on the Submit Article page.
- When the limit is reached, disable submission and show: “You have reached your article submission limit. To request an increase, email support@wwjmrd.com.”
- Add a numeric daily-limit control for each author in the admin Authors area and author detail page.
- When an admin increases an author’s limit, that author can immediately submit up to the newly allowed number.

## Secure enforcement
- Store each author’s custom limit in their profile, defaulting to 5.
- Add a database function that returns the current rolling 24-hour usage, configured limit, and remaining allowance.
- Enforce the limit in the database when a new article is inserted, preventing bypasses, duplicate tabs, and simultaneous submissions.
- Exempt admin-created submissions made on an author’s behalf; the restriction applies to author submissions only.

## Interface behavior
- Check availability before uploading or starting payment to avoid unnecessary uploads or charges.
- Recheck during final article creation so the displayed count cannot become stale.
- Preserve clear error handling across normal, Razorpay, and PayPal submission paths.
- Refresh admin and author views immediately after a limit change or successful submission.

## Technical details
- Add a non-negative integer profile field with default `5`.
- Use article `created_at` values newer than `now() - interval '24 hours'` and exclude admin-created records.
- Add an authenticated read function for the author’s own quota and an admin update path protected by existing role checks.
- Update generated database types only through the project’s supported backend type flow.

## Verification
- Verify submissions 1–5 succeed and submission 6 is rejected.
- Verify raising the limit to 6 allows the next submission immediately.
- Verify lowering a limit blocks further submissions without affecting existing articles.
- Verify revisions/replacements and admin-submitted articles do not consume the author limit.
