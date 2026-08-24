/**
 * supabase-js throws a generic FunctionsHttpError ("Edge Function returned a
 * non-2xx status code") whenever an edge function responds with an error
 * status. The actionable message lives in the response body (`error.context`).
 * This helper unwraps it so users see the real reason.
 */
export async function resolveEdgeFunctionError(error: any, fallback = "Request failed"): Promise<Error> {
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
