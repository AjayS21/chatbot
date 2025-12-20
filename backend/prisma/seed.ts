import { PrismaClient } from "@prisma/client";

/**
 * Seed script with a single example conversation.
 *
 * Intentionally minimal:
 * - Gives developers something to query locally.
 * - Avoids coupling seed data to any API shape (we're not building endpoints yet).
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const conversation = await prisma.conversation.create({
      data: {
        channel: "whatsapp",
        externalConversationId: "example-thread-001",
        title: "Example conversation",
        messages: {
          create: [
            {
              direction: "inbound",
              content: "Hello! (seed message)",
              externalMessageId: "example-msg-001",
              metadata: { seeded: true }
            },
            {
              direction: "outbound",
              content: "Hi! This is a placeholder reply.",
              externalMessageId: "example-msg-002",
              metadata: { seeded: true }
            }
          ]
        }
      },
      include: { messages: true }
    });

    console.log("Seeded conversation:", {
      id: conversation.id,
      channel: conversation.channel,
      messages: conversation.messages.length
    });
  } finally {
    // Always disconnect, even if create() throws.
    // Otherwise seeds can hang due to open connection pool.
    await prisma.$disconnect();
  }
}

await main();


