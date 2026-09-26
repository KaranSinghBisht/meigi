import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { WorldVerificationError } from "./world/session.js";

/** An error that is safe to show to the caller: a stable code plus a human-readable message. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Maps errors to JSON responses without leaking stack traces or internals. */
export function handleError(error: Error, c: Context) {
  if (error instanceof HttpError) {
    for (const [name, value] of Object.entries(error.headers)) c.header(name, value);
    return c.json({ code: error.code, message: error.message }, error.status);
  }
  if (error instanceof ZodError) {
    const fields = error.issues.map((issue) => issue.path.join(".") || "body");
    return c.json({ code: "invalid_input", message: `invalid fields: ${fields.join(", ")}` }, 400);
  }
  if (error instanceof WorldVerificationError) {
    return c.json({ code: `world_${error.code}`, message: error.message }, 401);
  }
  process.stderr.write(`[verifier] unexpected error: ${error.name}: ${error.message}\n`);
  return c.json({ code: "internal_error", message: "something went wrong" }, 500);
}
