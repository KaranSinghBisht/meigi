import type { TriageQuestions } from "./questions.js";
import type { TriageState } from "./state.js";

/**
 * Transports for the TypeSafe System-One contract (`POST /v1/systemone`). The same request body works for
 * Kev served locally, TypeSafe's own API, and the team's Cloudflare proxy (workers/ai-proxy); Jev on the
 * Workers AI REST API wraps it in `{ model: "typesafe/jev", input }` and answers inside `{ result }`.
 */

export interface SystemOneRequest {
  state: TriageState;
  questions: TriageQuestions;
}

export interface TriageBackend {
  name: string;
  /** Returns the raw `{ model?, answers }` payload; throws BackendError on any failure. */
  ask(body: SystemOneRequest): Promise<unknown>;
}

export class BackendError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

interface HttpOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Any `/v1/systemone` server: Kev on localhost:8009, TypeSafe's API, or the team's proxy ("proxy"). */
export function systemOneBackend(
  opts: HttpOptions & { url: string; apiKey?: string; model: string; name?: string },
): TriageBackend {
  return {
    name: opts.name ?? "systemone",
    ask: (body) => postJson(opts, opts.url, { ...body, model: opts.model }, opts.apiKey),
  };
}

export function cloudflareJevBackend(opts: HttpOptions & { accountId: string; apiToken: string }): TriageBackend {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(opts.accountId)}/ai/run`;
  return {
    name: "cloudflare",
    async ask(body) {
      const json = (await postJson(opts, url, { model: "typesafe/jev", input: body }, opts.apiToken)) as {
        success?: boolean;
        result?: unknown;
      };
      if (json.success === false || json.result === undefined) {
        throw new BackendError("upstream_error", "Workers AI returned an error envelope");
      }
      return json.result;
    },
  };
}

async function postJson(opts: HttpOptions, url: string, body: unknown, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const init = { method: "POST", headers, body: JSON.stringify(body) };
  let response = await send(opts, url, init);
  if (response.status === 429 || response.status === 529) {
    await new Promise((resolve) => setTimeout(resolve, 400)); // one polite retry, as TypeSafe asks
    response = await send(opts, url, init);
  }
  if (!response.ok) throw await httpError(response);
  try {
    return await response.json();
  } catch {
    throw new BackendError("bad_response", "the response was not JSON");
  }
}

/** Jev on Workers AI can refuse for lack of credits with a 402 or with a "balance" message in the body. */
async function httpError(response: Response): Promise<BackendError> {
  const body = (await response.text().catch(() => "")).slice(0, 500);
  if (response.status === 402 || /insufficient|balance|credit/iu.test(body)) {
    return new BackendError("payment_required", statusMessage(402));
  }
  return new BackendError(`http_${response.status}`, statusMessage(response.status));
}

async function send(opts: HttpOptions, url: string, init: RequestInit): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  try {
    return await (opts.fetch ?? fetch)(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new BackendError("timeout", `no answer within ${timeoutMs / 1000}s`);
    }
    throw new BackendError("unreachable", "could not connect");
  }
}

function statusMessage(status: number): string {
  if (status === 401 || status === 403) return "unauthorized: check the API key or token";
  if (status === 402) return "payment required: the account has no inference credits yet";
  if (status === 404) return "endpoint not found";
  if (status === 429 || status === 529) return "rate limited";
  if (status >= 500) return `server error (${status})`;
  return `request rejected (${status})`;
}
