import { PrismaClient } from "@prisma/client";
import { ApiError } from "../utils/apiError.js";

let prismaSingleton: PrismaClient | null = null;

function getDatabaseUrlOrThrow(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // We throw a clear error (instead of failing mysteriously on first query).
    // Also, we do *not* eagerly require DB configuration at process start, so the server can boot
    // even when no DB is needed yet (useful during early scaffolding and for certain CLI tasks).
    throw new ApiError({
      statusCode: 500,
      code: "db_not_configured",
      message:
        "DATABASE_URL is not set. Configure it before calling endpoints that require persistence."
    });
  }
  return url;
}

/**
 * Returns a lazily-initialized Prisma client.
 *
 * Why lazy:
 * - Avoids crashing server boot when DB isn't configured yet.
 * - Keeps initialization cheap for code paths that don't touch persistence.
 */
export function getDbClient(): PrismaClient {
  if (prismaSingleton) return prismaSingleton;

  // Validate config before constructing the client to surface errors early and clearly.
  void getDatabaseUrlOrThrow();

  prismaSingleton = new PrismaClient();
  return prismaSingleton;
}

/**
 * Clean shutdown helper.
 *
 * Why:
 * - Prevents hanging Node processes in dev/test environments.
 * - Ensures pooled connections are released promptly.
 */
export async function disconnectDb(): Promise<void> {
  if (!prismaSingleton) return;
  await prismaSingleton.$disconnect();
  prismaSingleton = null;
}


