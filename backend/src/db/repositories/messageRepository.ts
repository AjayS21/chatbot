import { Prisma, type Message } from "@prisma/client";
import { getDbClient } from "../client.js";

export type Direction = "inbound" | "outbound";

export type CreateMessageInput = {
  conversationId: string;
  direction: Direction;
  content: string;
  /**
   * JSON metadata for observability/debugging (provider/model/fallback flags, etc.).
   * Must be secret-safe (never store API keys).
   */
  metadata?: Prisma.InputJsonValue;
};

/**
 * Data-access helpers for `Message`.
 */
export async function createMessage(input: CreateMessageInput): Promise<Message> {
  const prisma = getDbClient();
  return prisma.message.create({
    data: {
      conversationId: input.conversationId,
      direction: input.direction,
      content: input.content,
      ...(input.metadata ? { metadata: input.metadata } : {})
    }
  });
}

export async function listMessagesByConversationId(conversationId: string): Promise<Message[]> {
  const prisma = getDbClient();
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" }
  });
}

export async function listRecentMessagesByConversationId(args: {
  conversationId: string;
  limit: number;
}): Promise<Message[]> {
  const prisma = getDbClient();
  const recent = await prisma.message.findMany({
    where: { conversationId: args.conversationId },
    orderBy: { createdAt: "desc" },
    take: args.limit
  });
  return recent.reverse();
}


