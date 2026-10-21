/**
 * supabase-js throws a generic FunctionsHttpError ("Edge Function returned a
 * non-2xx status code") whenever an edge function responds with an error
 * status. The actionable message lives in the response body (`error.context`).
 * This helper unwraps it so users see the real reason.
 */
export async function resolveEdgeFunctionError(error: any, fallback = "Request failed"): Promise<Error> {
  // FunctionsFetchError: the browser never got a response (connection dropped,
  // server took too long, or the request was blocked). The raw text is
  // "Failed to send a request to the Edge Function", which tells users nothing.
  if (error?.name === "FunctionsFetchError" || /Failed to send a request/i.test(error?.message || "")) {
    return new Error(`${fallback}: the server did not respond. Please check your internet connection and try again in a minute.`);
  }
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.clone === "function") {
      const body = await ctx.clone().json().catch(() => null);
      if (body?.error) {
        return new Error(typeof body.error === "string" ? body.error : JSON.stringify(body.error));
      }
    }
  } catch {
    // fall through to the generic message
  }
  return new Error(error?.message || fallback);
}
