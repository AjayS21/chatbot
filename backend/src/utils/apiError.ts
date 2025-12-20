/**
 * Lightweight API error type.
 *
 * Why:
 * - Fastify already has strong built-in errors, but a tiny explicit error object is useful
 *   for domain checks (e.g. "conversation not found") where we want a predictable status code.
 * - We keep it intentionally small to avoid over-engineering early.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(opts: { statusCode: number; code: string; message: string }) {
    super(opts.message);
    this.statusCode = opts.statusCode;
    this.code = opts.code;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return (
    typeof err === "object" &&
    err !== null &&
    "statusCode" in err &&
    "code" in err &&
    typeof (err as { statusCode?: unknown }).statusCode === "number" &&
    typeof (err as { code?: unknown }).code === "string"
  );
}


