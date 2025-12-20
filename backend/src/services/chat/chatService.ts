import { Prisma } from "@prisma/client";
import { ApiError } from "../../utils/apiError.js";
import {
  createConversation,
  findConversationById
} from "../../db/repositories/conversationRepository.js";
import {
  createMessage,
  listMessagesByConversationId,
  listRecentMessagesByConversationId,
  type Direction
} from "../../db/repositories/messageRepository.js";
import { generateReply } from "../llm/generateReply.js";

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "string" && value.trim().length > 0 ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

// Bound history to control cost/latency and to avoid hitting provider context limits.
// The LLM layer also truncates defensively; this DB limit keeps reads and payload sizes bounded.
const HISTORY_LIMIT = clampInt(process.env.LLM_HISTORY_LIMIT, 1, 100, 20);

export type SendMessageInput = {
  message: string;
  sessionId?: string;
};

export type SendMessageResult = {
  reply: string;
  sessionId: string;
};

export type ChatMessageDto = {
  id: string;
  direction: Direction;
  content: string;
  createdAt: string;
};

export type GetChatSessionResult = {
  reply: string;
  sessionId: string;
  messages: ChatMessageDto[];
};

function toLlmRole(direction: Direction): "user" | "assistant" {
  return direction === "inbound" ? "user" : "assistant";
}

/**
 * Core chat business logic (channel-agnostic).
 *
 * Why keep this independent of HTTP:
 * - Web routes, WhatsApp webhooks, Instagram webhooks can all call the same service.
 * - The only channel-specific piece is how you map inbound/outbound messages and session identity.
 */
export async function sendChatMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const normalizedSessionId = input.sessionId?.trim();

  const conversation =
    !normalizedSessionId
      ? await createConversation({
          channel: "web",
          title: "Web session"
        })
      : await findConversationById(normalizedSessionId);

  if (!conversation) {
    throw new ApiError({
      statusCode: 404,
      code: "invalid_session",
      message: "Session not found"
    });
  }

  const userText = input.message.trim();

  // Requirement: persist user message.
  await createMessage({
    conversationId: conversation.id,
    direction: "inbound",
    content: userText
  });

  // Include recent history for better answers, but bound it to control cost/latency.
  const history = await listRecentMessagesByConversationId({
    conversationId: conversation.id,
    limit: HISTORY_LIMIT
  });

  const { reply, meta } = await generateReply({
    history: history.map((m) => ({ role: toLlmRole(m.direction as Direction), content: m.content }))
  });

  const safeLlmMeta: Prisma.JsonObject = {
    provider: meta.provider,
    model: meta.model,
    usedFallback: meta.usedFallback,
    ...(meta.errorCode ? { errorCode: meta.errorCode } : {})
  };

  await createMessage({
    conversationId: conversation.id,
    direction: "outbound",
    content: reply,
    metadata: { llm: safeLlmMeta }
  });

  return { reply, sessionId: conversation.id };
}

export async function getChatSession(sessionId: string): Promise<GetChatSessionResult> {
  const conversation = await findConversationById(sessionId);
  if (!conversation) {
    throw new ApiError({
      statusCode: 404,
      code: "not_found",
      message: "Conversation not found"
    });
  }

  const messages = await listMessagesByConversationId(conversation.id);
  const lastOutbound = [...messages].reverse().find((m) => m.direction === "outbound");

  return {
    reply: lastOutbound?.content ?? "",
    sessionId: conversation.id,
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction as Direction,
      content: m.content,
      createdAt: m.createdAt.toISOString()
    }))
  };
}


