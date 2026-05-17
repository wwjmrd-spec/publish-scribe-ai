// Shared AI gateway helper.
// Reads provider config from admin_settings (admin-editable) with env fallbacks.
// All three supported providers (Gemini, OpenAI, Groq) expose OpenAI-compatible
// chat completion endpoints, so call sites can keep their existing request shape;
// only the URL, key, and model name change.

import { createClient } from "npm:@supabase/supabase-js@2";

export type AiProvider = "gemini" | "openai" | "groq" | "lovable";

export interface AiGatewayConfig {
  provider: AiProvider;
  url: string;
  apiKey: string;
  model: string;
}

const FALLBACK_PROVIDER: AiProvider = "lovable";

const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  lovable: "google/gemini-3-flash-preview",
};

const PROVIDER_URLS: Record<AiProvider, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  lovable: "https://ai.gateway.lovable.dev/v1/chat/completions",
};

const ENV_KEYS: Record<AiProvider, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  lovable: "LOVABLE_API_KEY",
};

function normalizeProvider(value: string | undefined): AiProvider {
  const v = (value || "").toLowerCase().trim();
  if (v === "openai" || v === "chatgpt" || v === "gpt") return "openai";
  if (v === "groq") return "groq";
  if (v === "lovable") return "lovable";
  return "gemini";
}

export async function getAiGatewayConfig(): Promise<AiGatewayConfig> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  const { data } = await sb
    .from("admin_settings")
    .select("setting_key, setting_value")
    .in("setting_key", ["ai_provider", "ai_api_key", "ai_model"]);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.setting_key as string] = (row.setting_value as string) ?? "";
  }

  const provider = normalizeProvider(map.ai_provider);
  const apiKey =
    (map.ai_api_key && map.ai_api_key.trim()) ||
    Deno.env.get(ENV_KEYS[provider]) ||
    Deno.env.get("LOVABLE_API_KEY") ||
    "";
  const model = (map.ai_model && map.ai_model.trim()) || DEFAULT_MODELS[provider];

  if (!apiKey) {
    throw new Error(
      `AI is not configured. Set provider/API key in Admin > AI Settings, or set ${ENV_KEYS[provider]}.`,
    );
  }

  return { provider, url: PROVIDER_URLS[provider], apiKey, model };
}

function buildHeaders(cfg: AiGatewayConfig): Record<string, string> {
  if (cfg.provider === "lovable") {
    return {
      "Lovable-API-Key": cfg.apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      "Content-Type": "application/json",
    };
  }

  return {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
}

function shouldFallbackToLovable(_cfg: AiGatewayConfig, _response: Response): boolean {
  // Fallback disabled: the admin's configured provider (Gemini/OpenAI/Groq) is
  // always used. Errors surface directly so issues with the configured key are
  // visible instead of being masked by a Lovable AI retry.
  return false;
}

function getLovableFallbackConfig(): AiGatewayConfig | null {
  const apiKey = Deno.env.get(ENV_KEYS.lovable) || "";
  if (!apiKey) return null;

  return {
    provider: FALLBACK_PROVIDER,
    url: PROVIDER_URLS.lovable,
    apiKey,
    model: DEFAULT_MODELS.lovable,
  };
}

/**
 * Convenience wrapper that POSTs an OpenAI-compatible chat completion payload
 * to the configured provider. Caller can pass any fields (messages, tools, etc.)
 * The `model` field is always overridden with the configured model.
 */
export async function aiChatCompletion(
  cfg: AiGatewayConfig,
  payload: Record<string, unknown>,
): Promise<Response> {
  const body = JSON.stringify({ ...payload, model: cfg.model });
  const response = await fetch(cfg.url, {
    method: "POST",
    headers: buildHeaders(cfg),
    body,
  });

  if (!shouldFallbackToLovable(cfg, response)) return response;

  const errorText = await response.text();
  console.error(
    `AI provider '${cfg.provider}' failed with ${response.status}; retrying with Lovable AI fallback.`,
    errorText,
  );

  const fallback = getLovableFallbackConfig();
  if (!fallback) {
    return new Response(errorText, { status: response.status, headers: response.headers });
  }

  return await fetch(fallback.url, {
    method: "POST",
    headers: buildHeaders(fallback),
    body: JSON.stringify({ ...payload, model: fallback.model }),
  });
}
