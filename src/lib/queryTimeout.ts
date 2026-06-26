export function queryTimeout(ms = 15000): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }

  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), ms);
  return controller.signal;
}