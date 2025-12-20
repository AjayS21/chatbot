import type { FastifyPluginAsync } from "fastify";

/**
 * Simple health endpoint.
 *
 * Why keep it:
 * - Confirms the server boots and routing works.
 * - Does not expose any chat/business logic.
 */
export const registerHealthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    return { ok: true };
  });
};


