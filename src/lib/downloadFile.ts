/**
 * Cross-browser file download triggered from a (signed) URL.
 *
 * iOS Safari quirks handled here:
 *  - Safari ignores the `download` attribute on cross-origin URLs.
 *  - Safari blocks programmatic `<a target="_blank">` clicks that aren't
 *    triggered as a direct result of a user gesture (popup blocker).
 *  - Calling `window.open()` from inside a Promise/async handler is also
 *    blocked unless we open the window synchronously.
 *
 * Strategy:
 *  - On iOS Safari, navigate the current tab to the signed URL. Because the
 *    URL includes a Content-Disposition: attachment header (set by Supabase
 *    when generating the signed URL with `{ download }`), Safari shows the
 *    iOS share/save sheet instead of leaving the app.
 *  - On other browsers, use the classic anchor click in a new tab.
 */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPad on iOS 13+ reports as Mac; detect via touch points.
  const isIPadOS =
    /Mac/.test(ua) && typeof (navigator as any).maxTouchPoints === "number" && (navigator as any).maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || isIPadOS;
}

export function downloadFromUrl(url: string, _filename?: string) {
  if (!url) return;

  if (isIOS()) {
    // Same-tab navigation reliably triggers the iOS save/share sheet for
    // attachment responses. Opening a new tab via window.open() is blocked
    // when the call isn't synchronous with the user's tap.
    window.location.href = url;
    return;
  }

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  // `download` is a hint; for cross-origin signed URLs the server's
  // Content-Disposition header decides the filename.
  a.download = "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
