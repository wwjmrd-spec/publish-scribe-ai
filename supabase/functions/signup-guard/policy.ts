export const SIGNUP_ACTION = 'email_signup';
const PROJECT_ID = '7fb6d7a3-9d67-46c8-b220-2239f19803b5';
const HOSTS = new Set(['wwjmrdai.online', 'www.wwjmrdai.online', 'wwjmrdai.lovable.app', `id-preview--${PROJECT_ID}.lovable.app`]);

export function allowedHostname(host: string): boolean {
  return HOSTS.has(host) || new RegExp(`^preview--${PROJECT_ID}\\.lovable\\.app$`).test(host);
}

export function allowedOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.port === '' && url.origin === origin && allowedHostname(url.hostname);
  } catch { return false; }
}

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split('@').pop() || '';
}

export function domainCandidates(domain: string): string[] {
  const labels = domain.split('.');
  return labels.slice(0, -1).map((_, index) => labels.slice(index).join('.'));
}

export type Verification = {
  success?: boolean;
  hostname?: string;
  action?: string;
  challenge_ts?: string;
  'error-codes'?: string[];
};

export function captchaAccepted(result: Verification, now = Date.now()): boolean {
  const timestamp = Date.parse(result.challenge_ts || '');
  return result.success === true && allowedHostname(result.hostname || '') &&
    result.action === SIGNUP_ACTION && Number.isFinite(timestamp) &&
    now - timestamp >= -30_000 && now - timestamp <= 300_000;
}