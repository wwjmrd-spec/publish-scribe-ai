import { z } from 'npm:zod@3.25.76';
import { allowedOrigin, captchaAccepted, domainCandidates, emailDomain, type Verification } from './policy.ts';

const SignupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(6).max(128),
  fullName: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(100),
  affiliation: z.string().trim().min(2).max(200),
  captchaToken: z.string().min(1).max(2048),
}).strict();

export type SignupInput = z.infer<typeof SignupSchema>;
export type Event = { event_type: string; provider: 'email'; email_domain?: string; reason?: string };
export type Dependencies = {
  siteKey: string;
  verify: (token: string) => Promise<Verification>;
  disposable: (domains: string[]) => Promise<boolean>;
  log: (event: Event) => Promise<void>;
  signup: (input: SignupInput, redirect: string) => Promise<{ error: boolean; confirmedSession: boolean }>;
};

export function createHandler(deps: Dependencies, cors: Record<string, string>) {
  return async (req: Request): Promise<Response> => {
    const headers = { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method === 'GET') return json({ siteKey: deps.siteKey, action: 'email_signup' });
    if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    const origin = req.headers.get('origin') || '';
    let domain: string | undefined;
    try {
      // Origin is a redirect/CSRF safeguard, not proof of client identity or an IP signal.
      if (!allowedOrigin(origin)) {
        await deps.log({ event_type: 'suspicious_activity', provider: 'email', reason: 'origin_rejected' });
        return json({ error: 'Please register from the official PubPortal website.' }, 403);
      }
      if (Number(req.headers.get('content-length') || 0) > 8192) return json({ error: 'Request too large.' }, 413);
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > 8192) return json({ error: 'Request too large.' }, 413);
      let body: unknown;
      try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid registration details.' }, 400); }
      await deps.log({ event_type: 'registration_attempt', provider: 'email' });
      const parsed = SignupSchema.safeParse(body);
      if (!parsed.success) {
        const missingCaptcha = parsed.error.issues.some(issue => issue.path[0] === 'captchaToken');
        await deps.log({ event_type: missingCaptcha ? 'captcha_failure' : 'registration_rejected', provider: 'email', reason: missingCaptcha ? 'missing_captcha' : 'invalid_input' });
        return json({ error: missingCaptcha ? 'Please complete the security check before signing up.' : 'Please enter valid registration details.' }, 400);
      }
      const input = parsed.data;
      domain = emailDomain(input.email);
      const result = await deps.verify(input.captchaToken);
      if (!captchaAccepted(result)) {
        await deps.log({ event_type: 'captcha_failure', provider: 'email', reason: 'invalid_expired_or_used_captcha' });
        return json({ error: 'The security check is invalid or expired. Please complete a new check.' }, 400);
      }
      await deps.log({ event_type: 'captcha_success', provider: 'email' });
      if (await deps.disposable(domainCandidates(domain))) {
        await deps.log({ event_type: 'disposable_rejection', provider: 'email', email_domain: domain, reason: 'known_disposable_domain' });
        return json({ error: 'Temporary email addresses are not accepted. Please use a permanent personal, university or work email.' }, 400);
      }
      const outcome = await deps.signup(input, `${origin}/`);
      if (outcome.error) {
        await deps.log({ event_type: 'registration_rejected', provider: 'email', reason: 'auth_rejected' });
        return json({ error: 'Unable to register. Please check your details or try again later.' }, 400);
      }
      await deps.log({ event_type: 'registration_submitted', provider: 'email', reason: outcome.confirmedSession ? 'confirmation_setting_unexpected' : 'confirmation_required' });
      // Never return sessions or tokens from the registration guard.
      return json({ ok: true, message: 'Please check your email to confirm your account.' });
    } catch {
      // Never log exception messages: upstream errors can contain credentials or request data.
      try { await deps.log({ event_type: 'guard_failure', provider: 'email', reason: 'dependency_unavailable' }); } catch { /* fail closed */ }
      return json({ error: 'Registration is temporarily unavailable. Please try again later.' }, 503);
    }
  };
}