# PubPortal partial signup security release

Date: 15 November 2026. This is a partial release, not a production security certification.

## Completed protections

- The email registration form calls `signup-guard`, which performs Cloudflare Siteverify before making the standard email/password signup request. No admin account creation or automatic email confirmation is used.
- The guard rejects missing, failed, expired and replayed CAPTCHA responses, unexpected action and unauthorized hostname. Expiration is checked against the five-minute challenge lifetime; replay rejection depends on Cloudflare's one-use Siteverify result, not a client assertion.
- Disposable-email checks are server-side, lowercase-normalized and include subdomains. The registry contains a curated 100-provider seed from the maintained `disposable-email-domains/disposable-email-domains` project. This is not the project's entire blocklist, and no scheduled update is installed.
- The public site key is retrieved from the guard configuration response. The private secret is used only for Siteverify and is not in project source.
- Private security events record registration attempts, CAPTCHA outcomes, disposable rejections, guard failures and unexpected request origins. Only admins can read events; only service-role code can write. No full email, password, CAPTCHA token, authentication token or IP is stored in these events.
- Login, managed Google OAuth, password recovery/reset-link resend, profile creation, roles, referrals, Mautic synchronization and daily article limits retain their existing implementations.
- All 1,327 existing accounts remain present. No existing credentials, profiles or roles were modified by this release.

## Files changed

- `src/pages/Auth.tsx`: signup widget, CAPTCHA token handling and guard errors.
- `src/contexts/AuthContext.tsx`: guarded registration; existing Mautic success synchronization retained.
- `src/components/auth/TurnstileSignup.tsx`: explicit widget loading, token expiry/reset/error handling.
- `src/contexts/AuthContext.test.tsx`, `src/pages/Auth.security.test.tsx`: integration regressions.
- `supabase/functions/signup-guard/index.ts`, `handler.ts`, `policy.ts`, `signup_test.ts`: guard and tests.
- `drizzle/migrations/0019_signup_security_partial_release.sql`: two new tables, RLS, policies, grants and index.
- `drizzle/migrations/0020_restrict_signup_security_grants.sql`: remove inherited anonymous/author privileges discovered during verification.
- Migration journal/snapshots and generated `src/integrations/supabase/types.ts`: tooling-generated schema records.
- `AGENTS.md`, `roadmap.md`, this report: architecture, scope and pending work.

## Database and deployment

Both migrations were applied. New tables: `disposable_email_domains` and `signup_security_events`. Existing tables and auth triggers were not changed. The domain seed was applied separately as a data operation, not embedded in a migration.

After the second migration, live privilege inspection confirmed anonymous read/write and authenticated write privileges are absent on both tables. RLS is enabled and authenticated SELECT policies require the existing server-side admin-role helper. Service-role write privileges remain available. Before that correction, inherited grants were broader than intended; no permissive write policy was installed, and the grants were narrowed before deployment.

`signup-guard` was deployed successfully after 14 server tests passed. The preview compiles successfully. Frontend changes are saved in the project; this does not publish the frontend to the production domain.

## Required secrets and Turnstile configuration

`TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY` are stored in Lovable Cloud. Their values are intentionally omitted from this report. No IP hashing secret is needed because this release does not implement IP collection/limits.

The private Turnstile secret was pasted into the conversation. Rotate it in Cloudflare and update `TURNSTILE_SECRET_KEY` through the secure secret form before production rollout.

Configure the widget to authorize these exact hostnames:

- `wwjmrdai.online`
- `www.wwjmrdai.online`
- `wwjmrdai.lovable.app`
- `id-preview--7fb6d7a3-9d67-46c8-b220-2239f19803b5.lovable.app`
- `preview--7fb6d7a3-9d67-46c8-b220-2239f19803b5.lovable.app` if that preview hostname is actually used.

Expected action: `email_signup`. Unrelated Lovable apps are not authorized. Additional project-specific preview hosts require an explicit policy/configuration update. Localhost is deliberately not authorized by the production guard.

## Test results

### Passed automated checks

14 Deno server tests passed, zero failed: valid mocked Gmail signup/confirmation response; missing/invalid/expired/replayed CAPTCHA; wrong hostname/action; exact origin allowlist; lowercase/subdomain disposable detection; Gmail/Outlook/Yahoo/university/custom-domain allowance; replay refusal; dependency outages fail closed; safe event fields; suspicious origin rejection; logging failure refusal.

8 frontend regression tests passed, zero failed: guarded signup and Mautic preservation; server rejection prevents sync; existing password-login path; managed Google helper; forgot-password redirect; reset-link resend; two existing cart regressions. React Router future-version warnings are non-failing.

These tests mock external authentication and Cloudflare. They do not prove real email delivery or successful real Google/password login.

### Passed live checks

- Guard public configuration endpoint responds successfully.
- Actual deployed guard returns HTTP 400 for missing CAPTCHA and invalid CAPTCHA; these requests create the expected private attempt/failure events.
- Existing managed author session opens a nonblank author dashboard. This checks session preservation, not a fresh credential login.
- Login button remains enabled independently of the signup CAPTCHA.
- Forgot-password dialog opens.
- Desktop/mobile signup screenshots inspected; no horizontal overflow at 390px width.
- Database checks confirm 1,327 accounts, 100 seeded domains and none of Gmail/Outlook/Yahoo/`bau.ac.kr` in the seed.

### Failed or unverified live checks

- Turnstile displayed “Unable to connect to website” in the local test browser, and the form correctly stayed disabled. The exact cause is not established: localhost is not an authorized production hostname and automated/headless challenges can also fail. Valid production/authorized-preview CAPTCHA completion and successful registration remain **unverified**.
- Real expired/replayed CAPTCHA tokens were not available; rejection is covered by mocked Siteverify tests only.
- A real disposable-email signup with a valid challenge was not exercised; the server dependency test covers that branch.
- No real Gmail registration, confirmation email delivery or confirmation-link consumption was performed. Hosted email-confirmation state was not independently read through a settings endpoint; the enable-email tool reports confirmation-on behavior and this release does not change confirmation settings.
- Existing Google/password authors were not freshly logged in with credentials. Google helper and password-login behavior are regression-tested; the existing injected author session works.
- Password recovery and resend are mocked integration-tested and their dialog checked; real mail delivery and recovery-link consumption remain **unverified**. Verification-email resend has no dedicated existing button; repeat guarded signup retains standard auth behavior but was not live-tested.
- Admin-created author and admin article submission were not run. The available injected session belongs to an author and correctly redirects admin pages to `/author`. Admin code and permissions were left unchanged; no test account/article was created.
- No authentication passwords were changed, no production email was intentionally sent, and no existing account was deleted.

## Remaining vulnerabilities and recommended next steps

1. **Direct managed Auth API bypass remains open.** A caller can bypass the form/guard and invoke the public managed email signup endpoint. This release does not claim global CAPTCHA or disposable-email enforcement. A supported native CAPTCHA/auth-hook gate is required to close it; a frontend guard alone is insufficient.
2. **No verified IP registration limits or custom recovery/resend limits.** No untrusted header is treated as a platform-authenticated IP. Confirm a trusted client-IP signal and server-enforced direct-auth controls before adding atomic hashed-IP counters. Existing platform limits are unchanged, not certified here.
3. **Google is not CAPTCHA-protected by this release.** Google suspicious-domain assessment/profile completion is deferred. Existing Google OAuth is unchanged. General suspicious-login monitoring is also pending; current suspicious events cover guard requests only.
4. **Do not publish as production-ready until real challenge/signup/confirmation checks pass** on an authorized host and the pasted private secret has been rotated. A widget outage prevents email registration but does not block existing login, Google or recovery.
5. Expand/update the curated domain seed after reviewing the maintained upstream list for false positives. No blanket university/custom-domain restriction is used. Schedule a reviewed refresh and event-retention policy; neither is automated in this release.
6. Complete the unverified login, real mail, admin-created author and admin-submission checks with authorized test accounts. No claim of complete preservation certification is made from source inspection alone.

## Rollback

Restore the previous registration form/context implementation to remove the partial guard from the frontend if needed; login/OAuth remain independent. Leave the additive tables/migrations intact rather than deleting audit records or accounts. Retire the guard only after frontend rollback. This report does not instruct disabling email confirmation or weakening existing authorization.