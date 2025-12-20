import fastify, { type FastifyInstance } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { registerHealthRoutes } from "./routes/health.js";
import { registerChatRoutes } from "./routes/chat.js";
import { isApiError } from "./utils/apiError.js";

/**
 * Constructs the Fastify instance with all plugins/routes registered.
 *
 * Why Fastify:
 * - Good performance with a small core.
 * - Strong plugin ecosystem for adding integrations later (e.g. webhooks, signature verification, rate limiting).
 *
 * The function is async to keep room for future async setup (DB connection, secrets loading) without redesign.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: true
  }).withTypeProvider<TypeBoxTypeProvider>();

  /**
   * Default error handler: keep responses consistent and avoid leaking internals.
   *
   * Important Fastify detail:
   * - Error handlers are encapsulated. If we register routes/plugins *before* setting the handler,
   *   those routes may continue using Fastify's default error shape.
   * - Therefore we set this handler before registering any routes.
   */
  app.setErrorHandler((error, _request, reply) => {
    if (isApiError(error)) {
      void reply.status(error.statusCode).send({
        error: error.code
      });
      return;
    }

    // Fastify may provide structured errors (e.g. invalid JSON, schema validation) with a status code and code.
    // We must not mask those as "internal_server_error" since that hurts UX and makes debugging harder.
    const maybeStatusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : undefined;
    const statusCode =
      (maybeStatusCode ?? (reply.statusCode >= 400 ? reply.statusCode : 500)) || 500;

    const maybeCode =
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;

    if (statusCode >= 500) {
      app.log.error({ err: error }, "Unhandled error");
    } else {
      // 4xx errors are expected for bad client input; log at a lower level to reduce noise.
      app.log.info({ err: error }, "Request error");
    }

    void reply.status(statusCode).send({
      error: maybeCode ?? (statusCode >= 500 ? "internal_server_error" : "bad_request")
    });
  });

  // Central place to register routes. Keeps route discovery predictable as we add more channels.
  await app.register(registerHealthRoutes);
  await app.register(registerChatRoutes);

  return app;
}

