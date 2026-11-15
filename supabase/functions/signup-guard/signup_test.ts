import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createHandler, type Dependencies, type Event } from './handler.ts';
import { allowedOrigin, captchaAccepted, domainCandidates, emailDomain } from './policy.ts';

const NOW = Date.now();
const valid = { success: true, hostname: 'wwjmrdai.online', action: 'email_signup', challenge_ts: new Date(NOW).toISOString() };
const input = { email: 'author@gmail.com', password: 'test-only-password', fullName: 'Test Author', country: 'India', affiliation: 'Test University', captchaToken: 'test-token' };
function setup(overrides: Partial<Dependencies> = {}) {
  const events: Event[] = [];
  let signups = 0;
  const handler = createHandler({
    siteKey: 'public-test-site-key', verify: async () => valid,
    disposable: async domains => domains.includes('mailinator.com'),
    log: async event => { events.push(event); },
    signup: async () => { signups++; return { error: false, confirmedSession: false }; },
    ...overrides,
  }, {});
  const request = (body: unknown = input, origin = 'https://wwjmrdai.online') => handler(new Request('https://example.test', {
    method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { request, events, signups: () => signups };
}

Deno.test('valid Gmail signup submits once and returns confirmation, no session', async () => {
  const s = setup(); const response = await s.request();
  assertEquals(response.status, 200); assertEquals(s.signups(), 1);
  assertEquals(await response.json(), { ok: true, message: 'Please check your email to confirm your account.' });
  assertEquals(s.events.map(e => e.event_type), ['registration_attempt','captcha_success','registration_submitted']);
});
Deno.test('missing CAPTCHA never reaches Auth', async () => {
  const s = setup(); assertEquals((await s.request({ ...input, captchaToken: undefined })).status, 400); assertEquals(s.signups(), 0);
});
Deno.test('invalid CAPTCHA never reaches Auth', async () => {
  const s = setup({ verify: async () => ({ success: false }) });
  assertEquals((await s.request()).status, 400); assertEquals(s.signups(), 0);
});
Deno.test('expired CAPTCHA older than five minutes rejected', async () => {
  assertEquals(captchaAccepted({ ...valid, challenge_ts: new Date(NOW - 300_001).toISOString() }, NOW), false);
});
Deno.test('already-used CAPTCHA Siteverify timeout-or-duplicate rejected', async () => {
  const s = setup({ verify: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }) });
  assertEquals((await s.request()).status, 400); assertEquals(s.signups(), 0);
});
Deno.test('wrong hostname or action rejected', () => {
  assertEquals(captchaAccepted({ ...valid, hostname: 'attacker.lovable.app' }, NOW), false);
  assertEquals(captchaAccepted({ ...valid, action: 'login' }, NOW), false);
});
Deno.test('only production www and specific authorized previews allowed', () => {
  assert(allowedOrigin('https://www.wwjmrdai.online'));
  assert(allowedOrigin('https://id-preview--7fb6d7a3-9d67-46c8-b220-2239f19803b5.lovable.app'));
  assertEquals(allowedOrigin('https://unrelated.lovable.app'), false);
  assertEquals(allowedOrigin('https://wwjmrdai.online.attacker.com'), false);
  assertEquals(allowedOrigin('http://wwjmrdai.online'), false);
});
Deno.test('disposable domain normalized and subdomains rejected server-side', async () => {
  const s = setup(); assertEquals(emailDomain(' Author@MAILINATOR.COM '), 'mailinator.com');
  assertEquals(domainCandidates('sub.mailinator.com'), ['sub.mailinator.com', 'mailinator.com']);
  const response = await s.request({ ...input, email: 'Author@SUB.MAILINATOR.COM' });
  assertEquals(response.status, 400); assertEquals(s.signups(), 0);
  assertEquals(s.events.at(-1)?.event_type, 'disposable_rejection');
});
Deno.test('permanent mainstream university and custom domains not categorically blocked', async () => {
  for (const domain of ['gmail.com','outlook.com','yahoo.com','bau.ac.kr','myresearch.org']) {
    const s = setup(); assertEquals((await s.request({ ...input, email: `author@${domain}` })).status, 200);
  }
});
Deno.test('same consumed CAPTCHA cannot submit twice when Siteverify rejects replay', async () => {
  let calls = 0;
  const s = setup({ verify: async () => ++calls === 1 ? valid : { success: false, 'error-codes': ['timeout-or-duplicate'] } });
  assertEquals((await s.request()).status, 200); assertEquals((await s.request()).status, 400); assertEquals(s.signups(), 1);
});
Deno.test('Siteverify outage and domain lookup outage fail closed', async () => {
  for (const overrides of [{ verify: async () => { throw new Error('private'); } }, { disposable: async () => { throw new Error('private'); } }]) {
    const s = setup(overrides); assertEquals((await s.request()).status, 503); assertEquals(s.signups(), 0);
    assertEquals(s.events.at(-1)?.reason, 'dependency_unavailable');
  }
});
Deno.test('private logs never contain passwords CAPTCHA or full email', async () => {
  const s = setup(); await s.request();
  const logs = JSON.stringify(s.events);
  for (const value of [input.email, input.password, input.captchaToken]) assertEquals(logs.includes(value), false);
});
Deno.test('untrusted origin logged as suspicious without accepting registration', async () => {
  const s = setup(); assertEquals((await s.request(input, 'https://unrelated.lovable.app')).status, 403);
  assertEquals(s.signups(), 0); assertEquals(s.events[0].event_type, 'suspicious_activity');
});
Deno.test('logging outage blocks registration rather than silently losing audit trail', async () => {
  const s = setup({ log: async () => { throw new Error('private'); } });
  assertEquals((await s.request()).status, 503); assertEquals(s.signups(), 0);
});