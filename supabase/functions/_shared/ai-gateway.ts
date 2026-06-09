// Shared AI gateway helper with backup-provider fallback chain.
// Admin configures a primary provider plus a JSON list of backups in
// `admin_settings`. On every call we try the primary, then walk each
// backup if the previous one returns a retryable status (429/402/5xx)
// or throws. After each attempt we persist provider health to
// `admin_settings.ai_provider_status` so the admin UI can show which
// provider is active and which are rate-limited.

import { createClient } from "npm:@supabase/supabase-js@2";

export type AiProvider = "gemini" | "openai" | "groq";

export interface AiGatewayConfig {
  provider: AiProvider;
  url: string;
  apiKey: string;
  model: string;
  // Stable label / index for status reporting (set by loadChain).
  _label?: string;
  _index?: number;
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
const CACHE_TTL_MS = 10_000;

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function loadChain(): Promise<AiGatewayConfig[]> {
  const now = Date.now();
  if (cachedChain && now - cachedAt < CACHE_TTL_MS) return cachedChain;

  const sb = getServiceClient();
  const { data } = await sb
    .from("admin_settings")
    .select("setting_key, setting_value")
    .in("setting_key", ["ai_provider", "ai_api_key", "ai_model", "ai_backup_chain"]);

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.setting_key as string] = (row.setting_value as string) ?? "";

  const chain: AiGatewayConfig[] = [];
  const primary = buildCfg(map.ai_provider || "gemini", map.ai_api_key || "", map.ai_model);
  if (primary) {
    primary._label = `Primary (${primary.provider}/${primary.model})`;
    primary._index = 0;
    chain.push(primary);
  }

  if (map.ai_backup_chain) {
    try {
      const arr = JSON.parse(map.ai_backup_chain);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          const cfg = buildCfg(item?.provider, item?.api_key, item?.model);
          if (cfg) {
            cfg._index = chain.length;
            cfg._label = `Backup #${chain.length} (${cfg.provider}/${cfg.model})`;
            chain.push(cfg);
          }
        }
      }
    } catch (_) { /* ignore malformed */ }
  }

  cachedChain = chain;
  cachedAt = now;
  return chain;
}

export function invalidateAiChainCache() {
  cachedChain = null;
  cachedAt = 0;
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

// ----- Provider status reporting --------------------------------------------

type ProviderStatusEntry = {
  index: number;
  label: string;
  provider: string;
  model: string;
  status: "ok" | "rate_limited" | "quota_exhausted" | "error" | "unknown";
  http_status?: number;
  message?: string;
  last_attempt_at?: string;
  last_success_at?: string;
};

let pendingStatuses = new Map<number, ProviderStatusEntry>();
let activeIndex: number | null = null;
let flushTimer: number | null = null;

function classify(httpStatus?: number, errMsg?: string): ProviderStatusEntry["status"] {
  if (errMsg && !httpStatus) return "error";
  if (!httpStatus) return "unknown";
  if (httpStatus === 429) return "rate_limited";
  if (httpStatus === 402) return "quota_exhausted";
  if (httpStatus >= 200 && httpStatus < 300) return "ok";
  return "error";
}

function recordStatus(
  cfg: AiGatewayConfig,
  ok: boolean,
  httpStatus?: number,
  errMsg?: string,
) {
  const idx = cfg._index ?? 0;
  const entry: ProviderStatusEntry = {
    index: idx,
    label: cfg._label ?? `${cfg.provider}/${cfg.model}`,
    provider: cfg.provider,
    model: cfg.model,
    status: classify(httpStatus, errMsg),
    http_status: httpStatus,
    message: errMsg?.slice(0, 200),
    last_attempt_at: new Date().toISOString(),
    last_success_at: ok ? new Date().toISOString() : pendingStatuses.get(idx)?.last_success_at,
  };
  pendingStatuses.set(idx, entry);
  if (ok) activeIndex = idx;
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flushStatuses, 500) as unknown as number;
}

async function flushStatuses() {
  flushTimer = null;
  if (pendingStatuses.size === 0) return;
  try {
    const sb = getServiceClient();
    // merge with existing
    const { data: existing } = await sb
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "ai_provider_status")
      .maybeSingle();

    let merged: Record<string, ProviderStatusEntry> = {};
    if (existing?.setting_value) {
      try {
        const parsed = JSON.parse(existing.setting_value);
        if (parsed && Array.isArray(parsed.providers)) {
          for (const p of parsed.providers) merged[String(p.index)] = p;
        }
      } catch (_) { /* ignore */ }
    }
    for (const [idx, entry] of pendingStatuses) merged[String(idx)] = entry;
    pendingStatuses.clear();

    const providers = Object.values(merged).sort((a, b) => a.index - b.index);
    const payload = {
      active_index: activeIndex,
      updated_at: new Date().toISOString(),
      providers,
    };
    const value = JSON.stringify(payload);

    const { data: existsRow } = await sb
      .from("admin_settings").select("id").eq("setting_key", "ai_provider_status").maybeSingle();
    if (existsRow) {
      await sb.from("admin_settings")
        .update({ setting_value: value, updated_at: new Date().toISOString() })
        .eq("id", existsRow.id);
    } else {
      await sb.from("admin_settings").insert({ setting_key: "ai_provider_status", setting_value: value });
    }
  } catch (e) {
    console.error("flushStatuses failed", e);
  }
}

// ----- Public API -----------------------------------------------------------

/**
 * POSTs an OpenAI-compatible chat completion payload. If the supplied cfg
 * returns a retryable status (rate limit, payment required, 5xx) or throws,
 * we walk every other entry in the admin-configured chain before returning
 * the last response. Provider status is persisted to admin_settings so the
 * admin UI can show which provider is active vs rate-limited.
 */
export async function aiChatCompletion(
  cfg: AiGatewayConfig,
  payload: Record<string, unknown>,
): Promise<Response> {
  // Ensure the cfg has chain metadata (callers from getAiGatewayConfig already do).
  if (cfg._index === undefined) {
    const chain = await loadChain();
    const match = chain.find(
      (c) => c.provider === cfg.provider && c.apiKey === cfg.apiKey && c.model === cfg.model,
    );
    if (match) { cfg._index = match._index; cfg._label = match._label; }
    else { cfg._index = 0; cfg._label = `${cfg.provider}/${cfg.model}`; }
  }

  let lastResp: Response | null = null;
  let lastErr: unknown = null;

  // Try the supplied cfg first.
  try {
    const r = await callOnce(cfg, payload);
    recordStatus(cfg, r.ok, r.status);
    if (r.ok || !RETRYABLE(r.status)) return r;
    lastResp = r;
  } catch (e) {
    lastErr = e;
    recordStatus(cfg, false, undefined, e instanceof Error ? e.message : String(e));
  }

  // Walk chain, skipping the one we already tried.
  let chain: AiGatewayConfig[] = [];
  try { chain = await loadChain(); } catch (_) { /* ignore */ }

  for (const backup of chain) {
    if (backup.provider === cfg.provider && backup.apiKey === cfg.apiKey && backup.model === cfg.model) {
      continue;
    }
    try {
      const r = await callOnce(backup, payload);
      recordStatus(backup, r.ok, r.status);
      if (r.ok) {
        console.log(`AI fallback: ${cfg._label} → ${backup._label}`);
        return r;
      }
      if (!RETRYABLE(r.status)) return r;
      lastResp = r;
    } catch (e) {
      lastErr = e;
      recordStatus(backup, false, undefined, e instanceof Error ? e.message : String(e));
    }
  }

  if (lastResp) return lastResp;
  throw lastErr ?? new Error("AI gateway: all providers failed");
}
