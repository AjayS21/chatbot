import { buildApp } from "./server.js";

/**
 * Entry point kept intentionally small.
 *
 * Why:
 * - Splitting `buildApp()` from `start()` makes the app easy to test later (inject requests without opening a port).
 * - We expect to support multiple channels (WhatsApp/Instagram/etc.); keeping an explicit boot boundary avoids tight coupling.
 */
async function start(): Promise<void> {
  const app = await buildApp();

  const port = parseInt(process.env.PORT ?? "3001", 10);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({ port, host });
  } catch (err) {
    // Never fail silently on boot. In container environments, the process must exit non-zero to trigger restarts.
    app.log.error({ err }, "Failed to start server");
    process.exitCode = 1;
  }
}

await start();

