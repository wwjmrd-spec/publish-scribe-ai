// Shared embedding helper backed by the Lovable AI Gateway.
// Used for knowledge base / FAQ / support-ticket semantic search.

const GATEWAY = "https://ai.gateway.lovable.dev/v1/embeddings";
export const EMBEDDING_MODEL = "google/gemini-embedding-2";

export async function embedText(input: string): Promise<number[]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");

  const text = (input || "").trim().slice(0, 6000);
  if (!text) throw new Error("Cannot embed empty text");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Lovable-API-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("Embedding response had no vector");
  return vec;
}

export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
