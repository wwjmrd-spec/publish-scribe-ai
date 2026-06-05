// Shared AI gateway helper with backup-provider fallback chain.
// Admin can configure a primary provider in `admin_settings` plus a JSON list
// of backups in `ai_backup_chain`. If the primary returns 429/402/5xx, we
// transparently retry through each backup before surfacing the error.

import { createClient } from "npm:@supabase/supabase-js@2";

export type AiProvider = "gemini" | "openai" | "groq";

export interface AiGatewayConfig {
  provider: AiProvider;
  url: string;
  apiKey: string;
  model: string;
}

const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
};

const PROVIDER_URLS: Record<AiProvider, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
};

const ENV_KEYS: Record<AiProvider, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
};

function normalizeProvider(value: string | undefined): AiProvider {
  const v = (value || "").toLowerCase().trim();
  if (v === "openai" || v === "chatgpt" || v === "gpt") return "openai";
  if (v === "groq") return "groq";
  return "gemini";
}

function buildCfg(provider: string, apiKey: string, model?: string): AiGatewayConfig | null {
  const p = normalizeProvider(provider);
  const key = (apiKey && apiKey.trim()) || Deno.env.get(ENV_KEYS[p]) || "";
  if (!key) return null;
  return {
    provider: p,
    url: PROVIDER_URLS[p],
    apiKey: key,
    model: (model && model.trim()) || DEFAULT_MODELS[p],
  };
}

let cachedChain: AiGatewayConfig[] | null = null;
let cachedAt = 0;

async function loadChain(): Promise<AiGatewayConfig[]> {
  const now = Date.now();
  if (cachedChain && now - cachedAt < 30_000) return cachedChain;

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data } = await sb
    .from("admin_settings")
    .select("setting_key, setting_value")
    .in("setting_key", ["ai_provider", "ai_api_key", "ai_model", "ai_backup_chain"]);

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.setting_key as string] = (row.setting_value as string) ?? "";

  const chain: AiGatewayConfig[] = [];
  const primary = buildCfg(map.ai_provider || "gemini", map.ai_api_key || "", map.ai_model);
  if (primary) chain.push(primary);

  if (map.ai_backup_chain) {
    try {
      const arr = JSON.parse(map.ai_backup_chain);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          const cfg = buildCfg(item?.provider, item?.api_key, item?.model);
          if (cfg) chain.push(cfg);
        }
      }
    } catch (_) { /* ignore malformed */ }
  }

  cachedChain = chain;
  cachedAt = now;
  return chain;
}

export async function getAiGatewayConfig(): Promise<AiGatewayConfig> {
  const chain = await loadChain();
  if (chain.length === 0) {
    throw new Error("AI is not configured. Add a provider/API key in Admin → Settings → AI.");
  }
  return chain[0];
}

function buildHeaders(cfg: AiGatewayConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
}

async function callOnce(cfg: AiGatewayConfig, payload: Record<string, unknown>): Promise<Response> {
  return await fetch(cfg.url, {
    method: "POST",
    headers: buildHeaders(cfg),
    body: JSON.stringify({ ...payload, model: cfg.model }),
  });
}

const RETRYABLE = (status: number) => status === 429 || status === 402 || status >= 500;

/**
 * POSTs an OpenAI-compatible chat completion payload. If the given primary cfg
 * returns a retryable status (rate limit, payment required, 5xx), we walk the
 * admin-configured backup chain and return the first OK response. If none
 * succeed, the last response is returned (so callers can inspect the status).
 */
export async function aiChatCompletion(
  cfg: AiGatewayConfig,
  payload: Record<string, unknown>,
): Promise<Response> {
  let lastResp: Response | null = null;
  let lastErr: unknown = null;

  // Try the supplied cfg first.
  try {
    const r = await callOnce(cfg, payload);
    if (r.ok || !RETRYABLE(r.status)) return r;
    lastResp = r;
  } catch (e) {
    lastErr = e;
  }

  // Then walk the chain, skipping any entry that matches the cfg we already tried.
  let chain: AiGatewayConfig[] = [];
  try { chain = await loadChain(); } catch (_) { /* ignore */ }

  for (const backup of chain) {
    if (backup.provider === cfg.provider && backup.apiKey === cfg.apiKey && backup.model === cfg.model) {
      continue;
    }
    try {
      const r = await callOnce(backup, payload);
      if (r.ok) {
        console.log(`AI fallback: switched from ${cfg.provider}/${cfg.model} to ${backup.provider}/${backup.model}`);
        return r;
      }
      if (!RETRYABLE(r.status)) return r;
      lastResp = r;
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastResp) return lastResp;
  throw lastErr ?? new Error("AI gateway: all providers failed");
}
