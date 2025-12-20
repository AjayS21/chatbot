import type { Conversation } from "@prisma/client";
import { getDbClient } from "../client.js";

export type CreateConversationInput = {
  /**
   * Channel identifier (e.g. "web", "whatsapp", "instagram").
   *
   * Why string:
   * - Adding new channels later shouldn't require a DB migration.
   */
  channel: string;
  title?: string;
  externalConversationId?: string | null;
};

/**
 * Data-access helpers for `Conversation`.
 *
 * Why a repository layer (even thin):
 * - Keeps Prisma usage in one place so we can swap/extend persistence later.
 * - Makes service code read like business logic instead of SQL/ORM calls.
 */
export async function createConversation(input: CreateConversationInput): Promise<Conversation> {
  const prisma = getDbClient();
  return prisma.conversation.create({
    data: {
      channel: input.channel,
      ...(input.title ? { title: input.title } : {}),
      // Prisma expects `string | null` (not `undefined`) for this column.
      // We only include the field when the caller provides a value.
      ...(typeof input.externalConversationId !== "undefined"
        ? { externalConversationId: input.externalConversationId }
        : {})
    }
  });
}

export async function findConversationById(id: string): Promise<Conversation | null> {
  const prisma = getDbClient();
  return prisma.conversation.findUnique({ where: { id } });
}


