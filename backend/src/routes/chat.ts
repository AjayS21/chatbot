import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type, type Static } from "@sinclair/typebox";
import { sendChatMessage, getChatSession } from "../services/chatService.js";
import { ApiError } from "../utils/apiError.js";

const SendMessageBodySchema = Type.Object({
  message: Type.String({
    minLength: 1,
    maxLength: 4000,
    description: "User message text"
  }),
  sessionId: Type.Optional(
    Type.String({
      minLength: 1,
      description: "Conversation/session identifier (server-generated)"
    })
  )
});

const SessionParamsSchema = Type.Object({
  sessionId: Type.String({ minLength: 1 })
});

const ChatResponseSchema = Type.Object({
  reply: Type.String(),
  sessionId: Type.String()
});

const ChatHistoryResponseSchema = Type.Object({
  reply: Type.String(),
  sessionId: Type.String(),
  messages: Type.Array(
    Type.Object({
      id: Type.String(),
      direction: Type.Union([Type.Literal("inbound"), Type.Literal("outbound")]),
      content: Type.String(),
      createdAt: Type.String()
    })
  )
});

/**
 * Chat routes.
 *
 * Important:
 * - These endpoints are intentionally thin: validation + delegation to services.
 * - Channel-specific routes (WhatsApp/Instagram webhooks) can reuse the same service layer by mapping their
 *   inbound/outbound events to a sessionId + message payload.
 */
export const registerChatRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.post(
    "/chat/message",
    {
      schema: {
        body: SendMessageBodySchema,
        response: {
          200: ChatResponseSchema
        }
      }
    },
    async (request) => {
      const { message, sessionId } = request.body as Static<typeof SendMessageBodySchema>;

      // Schema validation ensures a string with minLength, but we also guard against whitespace-only input.
      // This prevents storing empty messages and avoids wasting LLM tokens.
      if (message.trim().length === 0) {
        // Using an ApiError keeps the response shape consistent with other domain errors.
        throw new ApiError({
          statusCode: 400,
          code: "empty_message",
          message: "Message must not be empty"
        });
      }

      // With `exactOptionalPropertyTypes`, we must avoid passing `sessionId: undefined`.
      const input = sessionId ? { message, sessionId } : { message };
      return await sendChatMessage(input);
    }
  );

  app.get(
    "/chat/:sessionId",
    {
      schema: {
        params: SessionParamsSchema,
        response: {
          200: ChatHistoryResponseSchema
        }
      }
    },
    async (request) => {
      const { sessionId } = request.params as Static<typeof SessionParamsSchema>;
      return await getChatSession(sessionId);
    }
  );
};


