# PubPortal — Next Security Phase: Technical Feasibility Report

**Review date:** 15 November 2026, UTC. **Decision:** NOT approved for production security release.

This is a feasibility review, not a security certification. No next-phase authentication changes, migrations, account edits, email sends or production publication were performed. Preview-only Total Authors pagination was corrected separately.

## Executive decision

The existing signup guard provides real server-side checks **only for requests reaching that guard**. It does not intercept the public managed authentication endpoint. Documentation and available Cloud tools do not establish supported native Turnstile configuration, a before-user-created hook, or configurable public-endpoint interception for this Cloud project. Those controls are **unresolved**, not declared impossible in the underlying authentication engine.

Do not expand the guard and present that as closure of the bypass. Do not introduce a service-key-based replacement authentication system, spoofable header checks, browser-only checks, a proxy whose origin remains reachable, or signup-trigger metadata flags presented as proof of CAPTCHA. No such workaround was implemented.

## Capability matrix

| Requirement | Supported or verifiable today | Remaining limitation / release decision |
|---|---|---|
| Guarded email signup CAPTCHA | Existing Cloud function calls Cloudflare Siteverify; validates success, exact hostname, `email_signup` action and five-minute age | Protects guard only; real authorized-host challenge remains unverified |
| Disposable-email rejection | Existing server registry lookup after successful CAPTCHA, normalized including parent domains | Direct Auth signup and managed Google account creation bypass this lookup; curated 100-domain registry is not exhaustive |
| Direct public signup CAPTCHA/disposable enforcement | No documented Cloud tool/configuration for native CAPTCHA or pre-creation hooks found | **OPEN**. Cannot certify closure without an authoritative supported configuration and direct endpoint tests |
| Google bot prevention before account creation | Managed Google OAuth is supported and retained | No supported app CAPTCHA attachment or pre-creation hook established. Google token validation is not equivalent to this app's bot/domain policy |
| Preserve existing Google login | No OAuth or role/profile code changed; hosted Google-enabled setting read successfully | Fresh existing-user login and new-user registration not exercised |
| Recovery/resend limits | A native project-wide auth-email hourly budget is documented and configurable | Not equivalent to per-account/hour or trusted-IP request limits. Current numerical budget and all native request throttles were not read/verified; no changes made |
| Direct-endpoint recovery/resend enforcement | No documented specific hook or per-account/IP settings exposed by available tools | **UNRESOLVED**. Wrapping requests in another function cannot enforce limits on bypassing callers |
| Trusted client IP | No verified platform-authenticated IP contract available | No IP read/storage, client-header trust or custom IP limit added |
| Turnstile secret replacement | Cloud secure update form can replace stored secret | External Cloudflare rotation requires widget-owner action; saving an arbitrary generated value would break verification |
| Existing data and permissions | Read-only database checks and authenticated admin pages verified | Full author-role/quality/history regression is still pending; no claim of complete preservation certification |

The official documentation and the tool contract differ on maximum auth-email quotas. This review therefore does not quote or change a project-specific quota. A shared sending budget may protect email resources, but it is neither the requested per-account limit nor verified bot protection.

## Evidence collected

### Hosted authentication — read-only

The public managed Auth settings endpoint returned HTTP 200:

- Public signup disabled: **false**.
- Email auto-confirm: **false** — confirmation remains required.
- Google provider enabled: **true**.
- No native CAPTCHA setting exposed in this public response. **Absence from this response does not prove CAPTCHA is disabled or that upstream hooks cannot exist.**

No private settings dump, service key or authentication token was copied to this report. Available configuration tools do not expose native CAPTCHA/pre-creation hooks. A multi-setting configuration writer was deliberately not used because unrelated current settings are not all known.

### Accounts and preserved records

Read-only counts at review time:

| Record | Count |
|---|---:|
| Authentication accounts | 1,327 |
| Existing profiles | 1,326 |
| Author role rows | 1,325 |
| Admin role rows | 1 |
| Articles | 492 |
| Articles with status exactly `published` | 135 |
| Article reviews | 577 |
| Non-null review report links | 451 |

These are different populations. **Total Authors preserves its existing profile-count meaning**, including the existing admin profile, rather than silently switching to authentication accounts or author-only role rows. The profile/auth discrepancy was not repaired or investigated by editing accounts.

Review score aggregate readback: plagiarism 44,487; grammar 41,340; content 38,004; overall 40,660. These are an inspection baseline, not proof of row-by-row historical equality or a security assessment of scores.

Existing profile, article and role policies were inspected read-only. No permission, trigger, password, profile, role, review or manuscript record was changed by this work.

## Author Quality Dashboard regression status

**Preservation status: untouched; complete live regression NOT YET VERIFIED.**

The current checkout has the existing Author Dashboard, article detail/review-report access and stored article review scores. A separately named “PubPortal – Author Quality Dashboard” route, component or table was not found in this checkout. It was not removed, renamed or replaced. This report cannot equate the general dashboard with an unidentified quality dashboard or certify its functionality from source inspection.

- Author dashboard, article submission/detail, review displays, manuscript access, profile, publication and route-guard code were not modified.
- The requesting user's injected session is currently **admin**. Navigating author-only routes correctly redirects this admin session to `/admin`; these redirects are **not successful author-dashboard tests**.
- Authenticated admin dashboard and Manage Authors load, with zero browser page errors. All Time Total Authors and Manage Authors both visibly show **1,326**.
- Current review scores/report-link records remain present in read-only inspection. Downloading actual reports was not exercised.
- Article submission and manuscript/history access were not performed as an author. No new article or manuscript was created.
- Profile/publication counts remain present; per-author historical equality and file accessibility remain unverified.
- Admin access works with the existing requesting session; author isolation and admin-to-author workflow need authorized role-specific regression. No impersonation was used.

**Production gate:** identify the exact existing quality-dashboard view and verify it using an authorized author session with saved scores/reports and manuscripts, plus an admin session. Confirm report access, manuscript/history access, profiles, publication records, and cross-author denial before deployment. No redesign or quality-dashboard implementation is authorized by this report.

## Tests rerun in this review

**25 automated tests passed; zero failed.** External Cloudflare/auth responses are mocked in these tests.

- 14 server guard tests: mocked successful Gmail signup; missing/invalid/expired/reused CAPTCHA; hostname/action constraints; disposable subdomains; mainstream/institutional/custom domains allowed; replay/outage handling; safe logs.
- 11 frontend/data tests: complete 1,326-profile pagination, failure propagation, stable auth context, guarded signup/Mautic preservation, server rejection, existing password path, managed Google helper, recovery request/reset-link resend and cart regressions.
- Preview compilation: latest observed build status OK.
- Live read-only UI: requesting admin session preserved, both corrected totals verified, no page errors.

### Requested live test matrix — explicit gaps

| Requested test | This review's result |
|---|---|
| Direct public signup without CAPTCHA | **Not executed with valid new credentials.** The shared backend also serves production; a successful probe could create an account and send mail. No isolated controlled recipient was supplied. Public signup is enabled, and there is no verified global gate. Bypass remains open/unresolved, not retested as fixed |
| Missing/invalid guard token | Automated checks passed; previous release's live HTTP 400 denials remain historical evidence, not a fresh check here |
| Real expired/reused token | Automated checks only; no real authorized challenge token obtained |
| Disposable registration with valid CAPTCHA | Automated rejection passed; live new-account flow not performed |
| Gmail/institutional signup and confirmation | Automated allowance passed; actual account creation, receipt and confirmation not performed |
| New/existing Google OAuth | Helper regression passed; provider enabled readback; actual interactive Google authorization not performed |
| Fresh password login | Existing code-path regression passed; live credential login not performed |
| Recovery/reset-link resend/reset completion | Mocked request tests passed; no real mail/reset completion; no existing password changed |
| Existing admin permissions | Existing admin session opens protected admin views; no role edits |
| Author quality/scores/reports/history | Source untouched and records present; full author-session workflow blocked as described above |

No malformed-email endpoint denial should be treated as proof of CAPTCHA enforcement. No production-account mutation is required for this feasibility review.

## Supported architecture options and their trade-offs

### A. Preserve current public registration while awaiting a supported native gate

Keep managed authentication and the partial guard unchanged. Native enforcement must be configured at the endpoint that actually creates the user, with a supported hook/CAPTCHA interface. Such an interface is not established for this Cloud project today. **This option retains the vulnerability and is not a production security approval.**

### B. Documented restricted-registration operating mode

Cloud documents disabling public signup while keeping existing-user login and administrative user creation available. An invitation-only process can remove open self-service email registration without replacing authentication. This is a change to product availability, **not equivalent to the requested CAPTCHA-enabled public signup**.

Before considering it: obtain explicit approval; verify the actual interaction with new versus existing managed Google users in an isolated environment; retain standard unconfirmed/invitation semantics and the established admin-create-author flow. Documentation does not conclusively establish Google-specific behavior for this switch, so it must not be enabled as an assumed Google fix. No switch was changed here.

### C. Post-session quality/suspicious-domain screening

Supported application-level controls could record bounded domain/provider risk signals after Google login and apply a narrowly scoped completion/review step for newly registered users. Existing authors can be grandfathered using trusted server-held account/registration state. This may protect access to future app workflows, **but does not prevent the managed Auth account from being created**, close the signup bypass, or globally limit recovery. It also requires separate authorization and permission regression. Nothing in the Author Quality Dashboard should be changed to implement it.

No supported equivalent that meets all requested public-signup, Google and recovery requirements was established without platform-native enforcement. Do not switch providers, disable Google or build custom authentication to hide this limitation.

## Turnstile production verification and safe rotation

**Not rotated or production-verified in this review.** The provider must issue a replacement secret; Lovable cannot rotate the Cloudflare widget without authorized Cloudflare access.

1. In Cloudflare Turnstile, select the existing PubPortal widget and use its secret-rotation operation. Preserve the public site key/widget. Do not paste the replacement into chat.
2. Replace `TURNSTILE_SECRET_KEY` using Lovable's secure secret update form. Do not use a random project-generated secret. Confirm replacement saved without revealing its value.
3. Confirm the widget's actual Cloudflare hostname list authorizes `wwjmrdai.online` and `www.wwjmrdai.online`, and only the exact intended project preview hosts. Cloudflare's configured list was not independently read in this review.
4. Existing server policy expects action exactly **`email_signup`** and validates challenge age at most five minutes. It allows the production apex/www, published Lovable hostname and explicitly scoped project previews, not arbitrary Lovable apps.
5. In a normal browser on an authorized hostname serving the guarded signup code, complete the CAPTCHA. Use authorized new Gmail and institutional test recipients. Verify server outcome, unconfirmed registration, confirmation delivery/link and subsequent login. Verify disposable rejection with a genuinely valid challenge and new/existing Google independently.
6. Because preview and published app share the backend, do not perform uncontrolled tests, publish code to obtain a test surface, bypass challenges with testing keys, or change existing credentials. Prefer an approved isolated draft/test environment for mutating checks.

Localhost verification or mocked Siteverify success does not satisfy the production challenge test. No production publication is authorized.

## Files and safety

Changed for the author-count request only: `src/lib/adminAuthorProfiles.ts`, its two tests, `src/pages/admin/AdminDashboard.tsx`, `src/pages/admin/AdminAuthors.tsx`; architecture/roadmap/report notes updated. Stable 500-row `created_at`/`id` pages remove the 1,000 response cap. Existing time filtering remains unchanged. Activity Report's separate New Authors/Emails Sent counts were outside the “Total Authors only” request and were not altered.

No new migration, function deployment, secret change, auth configuration change or production frontend publication occurred in this review. Existing Mautic, registration, submissions and Author Quality Dashboard code are untouched.

## Release gates / next decisions

1. Review this feasibility report before further security implementation.
2. Establish a supported native global signup/recovery enforcement capability or explicitly approve a restricted-registration trade-off; do not certify partial guard coverage as global.
3. Provider-issued Turnstile rotation and secure replacement, followed by authorized-host challenge and controlled mail/account tests.
4. Exact Author Quality Dashboard identification and full role-specific regression, including existing scores/reports and manuscript history.
5. Separate explicit production approval after server-side enforcement and all applicable live tests pass.

## Sources

- Lovable Users and authentication: https://docs.lovable.dev/features/authentication
- Email authentication / sending limits: https://docs.lovable.dev/features/email-auth
- Managed Google authentication: https://docs.lovable.dev/features/google-auth
- Cloud versus connected integration distinction: https://docs.lovable.dev/integrations/supabase
- Cloudflare Turnstile server verification: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

Official Lovable documentation lookup and Cloud capability guidance were reviewed. Upstream authentication-engine features are not assumed to be exposed by Lovable Cloud. No backend project identifiers, URLs, keys, tokens, full user emails or private settings are included.