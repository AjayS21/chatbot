import OpenAI from "openai";

export type OpenAiClientConfig = {
  apiKey: string;
  model: string;
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "string" && value.trim().length > 0 ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function getOpenAiConfigFromEnv(): OpenAiClientConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  return { apiKey, model };
}

/**
 * Lazily constructs the OpenAI client.
 *
 * Why lazy:
 * - Lets the server boot even if OPENAI_API_KEY isn't configured (useful in early dev or tests).
 * - Moves provider wiring into one place for easy replacement later.
 */
export function getOpenAiClientFromEnvOrNull(): { client: OpenAI; model: string } | null {
  const cfg = getOpenAiConfigFromEnv();
  if (!cfg) return null;
  // Bound network time so a single slow provider call doesn't pin server workers indefinitely.
  // (Env override is useful for debugging and for different environments.)
  const timeoutMs = clampInt(process.env.LLM_TIMEOUT_MS, 1_000, 120_000, 15_000);
  return { client: new OpenAI({ apiKey: cfg.apiKey, timeout: timeoutMs }), model: cfg.model };
}


