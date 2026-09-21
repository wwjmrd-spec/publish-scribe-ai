# Article details, review score floor, and paid formatting

## What will change

### Co-authors in article details
- Let both authors and admins add additional co-authors from article-detail editing.
- Replace the combined co-author name input with separate **First Name** and **Last Name** fields.
- Save both fields and keep the combined display name synchronized for emails, certificates, formatted documents, and older screens.
- Show first and last names separately in author and admin article details, including change-review records.
- Preserve email, affiliation, and ORCID editing and existing article-access rules.

### Review reports: minimum 70%
- Apply a 70% minimum to **all four scores**: plagiarism, grammar, content, and overall.
- Enforce the minimum when AI reviews are generated and when admins edit scores, so it cannot be bypassed from the screen or function request.
- Update score inputs, labels, colors, and automation thresholds to match the 70–100 range.
- Apply this only to future generated or edited reports; existing reports remain unchanged.

### Start formatting after payment
- Start article formatting immediately whenever an article-fee payment changes an article to **Paid** through Razorpay/PayPal, Binance, manual payment entry, or the admin “Mark Paid” action.
- Add a scheduled recovery check for paid articles still awaiting formatting, covering interrupted requests and older payment paths.
- Keep formatting idempotent so duplicate payment callbacks or recovery runs do not launch duplicate formatting jobs.
- Surface formatting-start failures without reversing a successfully recorded payment; the recovery check will retry eligible pending articles.

## Verification
- Validate author and admin co-author add/edit flows and separate-name display.
- Verify generated and manually edited reports cannot save any score below 70%.
- Verify each paid path starts formatting and the recovery path catches pending paid articles.
- Run focused tests and the project checks, then review the affected screens.
