import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getOpenAiClientFromEnvOrNull } from "./openaiClient.js";
import { FAQ_KNOWLEDGE, SYSTEM_PROMPT } from "./prompts.js";

export type GenerateReplyInput = {
  /**
   * Recent conversation history, ordered oldest → newest.
   *
   * Important:
   * - LLM layer should not know about persistence (DB/Prisma). This keeps it provider-focused and reusable.
   * - Channels (WhatsApp/Instagram/web) can all map their events into this normalized format.
   */
  history: Array<{ role: "user" | "assistant"; content: string }>;
};

export type GenerateReplyResult = {
  reply: string;
  /**
   * Metadata is returned so callers can persist debug info without leaking secrets.
   */
  meta: {
    provider: "openai";
    model: string;
    usedFallback: boolean;
    errorCode?: string;
  };
};

// Back-compat import: older code referenced OpenAI directly here. We now centralize client creation.
void OpenAI;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "string" && value.trim().length > 0 ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

// Limits exist to keep UX predictable and to control cost/latency.
// They also reduce the risk of sending overly long prompts that can exceed provider limits.
const MAX_OUTPUT_TOKENS = clampInt(process.env.LLM_MAX_OUTPUT_TOKENS, 1, 2_000, 250);
const MAX_HISTORY_MESSAGES = clampInt(process.env.LLM_HISTORY_LIMIT, 1, 100, 20);

function fallbackReply(): string {
  // Graceful fallback: we do not fail the whole request if the LLM is down/misconfigured.
  return "Sorry, I'm having trouble right now. Please try again in a moment.";
}

function classifyOpenAiError(err: unknown): "invalid_api_key" | "timeout" | "rate_limit" | "provider_error" {
  const e = err as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    name?: unknown;
    message?: unknown;
    error?: unknown;
  };

  const status =
    typeof e?.status === "number"
      ? e.status
      : typeof e?.statusCode === "number"
        ? e.statusCode
        : typeof (e?.error as { status?: unknown } | undefined)?.status === "number"
          ? (e.error as { status: number }).status
          : undefined;

  const code =
    typeof e?.code === "string"
      ? e.code
      : typeof (e?.error as { code?: unknown } | undefined)?.code === "string"
        ? ((e.error as { code: string }).code as string)
        : undefined;

  if (status === 401 || status === 403 || code === "invalid_api_key") return "invalid_api_key";
  if (status === 429 || code === "rate_limit_exceeded") return "rate_limit";

  // The OpenAI SDK uses fetch under the hood; timeouts and aborts may show up as AbortError or ETIMEDOUT.
  const name = typeof e?.name === "string" ? e.name : "";
  const message = typeof e?.message === "string" ? e.message : "";
  if (name === "AbortError") return "timeout";
  if (code === "ETIMEDOUT" || code === "ECONNABORTED") return "timeout";
  if (message.toLowerCase().includes("timeout") || message.toLowerCase().includes("timed out"))
    return "timeout";

  return "provider_error";
}

export async function generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
  try {
    const openai = getOpenAiClientFromEnvOrNull();
    const model = openai?.model ?? (process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini");

    if (!openai) {
      return {
        reply: fallbackReply(),
        meta: { provider: "openai", model, usedFallback: true, errorCode: "missing_api_key" }
      };
    }

    // Defensive truncation: callers *should* pass recent-only history, but we also enforce it here so
    // the LLM layer can't accidentally blow up token usage if a caller changes.
    const boundedHistory = input.history.slice(-MAX_HISTORY_MESSAGES);

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: FAQ_KNOWLEDGE },
      ...boundedHistory.map((m) => ({ role: m.role, content: m.content }))
    ];

    const completion = await openai.client.chat.completions.create({
      model: openai.model,
      messages,
      temperature: 0.3,
      // Keep responses bounded for predictable UX and cost.
      max_tokens: MAX_OUTPUT_TOKENS
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      return {
        reply: fallbackReply(),
        meta: { provider: "openai", model: openai.model, usedFallback: true, errorCode: "empty_response" }
      };
    }

    return {
      reply,
      meta: { provider: "openai", model: openai.model, usedFallback: false }
    };
  } catch (err) {
    // Never throw provider errors to the client; keep the UX stable.
    // Callers can still persist minimal metadata for debugging.
    const errorCode = classifyOpenAiError(err);
    return {
      reply: fallbackReply(),
      meta: {
        provider: "openai",
        model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
        usedFallback: true,
        errorCode
      }
    };
  }
}


