import { createRemoteJWKSet, customFetch, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

/**
 * The World ID for Agents OIDC provider (sandbox: https://sandbox.auth.world.org). Discovery is cached and pinned:
 * every endpoint must be on the issuer's own origin, and no request follows a redirect, so the client secret, the
 * device code and the key fetch never leave that origin. Every request is bounded by a timeout.
 */

export interface IdpOptions {
  issuer: string;
  clientId: string;
  clientSecret: string;
  authMethod: "client_secret_basic" | "client_secret_post";
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface Discovery {
  issuer: string;
  device_authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

export interface Idp {
  issuer: string;
  clientId: string;
  discovery(): Promise<Discovery>;
  keys(): Promise<JWTVerifyGetKey>;
  /** A form POST with client authentication. Network failures and timeouts throw IdpUnavailable. */
  post(url: string, params: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }>;
}

/** The IdP can't be reached or answered unusably: never a decision, and never an approval. */
export class IdpUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdpUnavailable";
  }
}

const discoverySchema = z.object({
  issuer: z.string(),
  device_authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
});

export function createIdp(opts: IdpOptions): Idp {
  const base = opts.fetch ?? fetch;
  const doFetch: typeof fetch = (input, init) => base(input, { ...init, redirect: "error" });
  const timeoutMs = opts.timeoutMs ?? 10_000;
  let discovered: Promise<Discovery> | null = null;
  let jwks: JWTVerifyGetKey | null = null;

  async function discovery(): Promise<Discovery> {
    discovered ??= loadDiscovery(opts.issuer, doFetch, timeoutMs).catch((error: unknown) => {
      discovered = null; // retry on the next attempt
      throw error;
    });
    return discovered;
  }

  return {
    issuer: opts.issuer,
    clientId: opts.clientId,
    discovery,
    async keys() {
      const { jwks_uri } = await discovery();
      jwks ??= createRemoteJWKSet(new URL(jwks_uri), { [customFetch]: doFetch, timeoutDuration: timeoutMs });
      return jwks;
    },
    post: (url, params) => postForm(opts, doFetch, timeoutMs, url, params),
  };
}

async function loadDiscovery(issuer: string, doFetch: typeof fetch, timeoutMs: number): Promise<Discovery> {
  let response: Response;
  try {
    response = await doFetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new IdpUnavailable("the World ID provider could not be reached");
  }
  if (!response.ok) throw new IdpUnavailable(`the World ID provider answered ${response.status}`);
  const parsed = discoverySchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new IdpUnavailable("the World ID provider's discovery document is unusable");
  const d = parsed.data;
  if (d.issuer !== issuer) throw new IdpUnavailable("the discovery document names a different issuer");
  const origin = new URL(issuer).origin;
  if ([d.device_authorization_endpoint, d.token_endpoint, d.jwks_uri].some((url) => new URL(url).origin !== origin)) {
    throw new IdpUnavailable("the discovery document points outside the issuer's origin");
  }
  return d;
}

async function postForm(opts: IdpOptions, doFetch: typeof fetch, timeoutMs: number, url: string, params: Record<string, string>) {
  const form = new URLSearchParams(params);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (opts.authMethod === "client_secret_basic") {
    const credentials = `${encodeURIComponent(opts.clientId)}:${encodeURIComponent(opts.clientSecret)}`;
    headers.authorization = `Basic ${Buffer.from(credentials).toString("base64")}`;
  } else {
    form.set("client_id", opts.clientId);
    form.set("client_secret", opts.clientSecret);
  }
  let response: Response;
  try {
    response = await doFetch(url, { method: "POST", headers, body: form.toString(), signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new IdpUnavailable("the World ID provider could not be reached");
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body: body && typeof body === "object" ? body : {} };
}
