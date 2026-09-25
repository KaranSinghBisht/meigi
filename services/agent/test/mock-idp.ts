import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { createApprovals, type ApprovalService } from "../src/approval/approvals.js";
import { createApproverRegistry, type ApproverRegistry } from "../src/approval/approvers.js";
import { createIdp, type Idp } from "../src/approval/idp.js";
import { ORB_ACR } from "../src/approval/token.js";

/**
 * A World ID for Agents IdP with no network: jose makes an RSA key and the JWKS is served from it; the device
 * and token endpoints are scripted fakes. Every request is recorded (method, URL, headers, form).
 */

export const ISSUER = "https://sandbox.auth.world.org";
export const CLIENT_ID = "app_meigi_test";
export const CLIENT_SECRET = "sk_test_never_leaves_the_server";
export const DEVICE_CODE = "dc_secret_device_code_0123456789";
export const USER_CODE = "WDJB-MJHT";

type Reply = { status: number; body: unknown } | "network";

export interface Recorded {
  method: string;
  url: string;
  headers: Headers;
  form: URLSearchParams;
}

export interface MockIdp {
  fetch: typeof fetch;
  requests: Recorded[];
  /** Token endpoint replies, in order; the last one repeats. */
  token: Reply[];
  device: Reply;
  jwksUp: boolean;
  sign(claims?: Record<string, unknown>, opts?: { key?: CryptoKey; kid?: string; alg?: string }): Promise<string>;
  otherKey: CryptoKey;
  clock: { now: number };
}

export const pending = { status: 400, body: { error: "authorization_pending" } };
export const slowDown = { status: 400, body: { error: "slow_down" } };
export const denied = { status: 400, body: { error: "access_denied" } };
export const expired = { status: 400, body: { error: "expired_token" } };
export const approvedWith = (idToken: string) => ({ status: 200, body: { access_token: "at", token_type: "Bearer", id_token: idToken } });

export async function mockIdp(start = 1_790_000_000): Promise<MockIdp> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const clock = { now: start };
  const idp: MockIdp = {
    requests: [],
    token: [pending],
    device: {
      status: 200,
      body: {
        device_code: DEVICE_CODE,
        user_code: USER_CODE,
        verification_uri: `${ISSUER}/device`,
        verification_uri_complete: `${ISSUER}/device?user_code=${USER_CODE}`,
        expires_in: 1200,
        interval: 5,
      },
    },
    jwksUp: true,
    otherKey: other.privateKey,
    clock,
    async sign(claims = {}, opts = {}) {
      const body = { iss: ISSUER, aud: CLIENT_ID, sub: "human-1", acr: ORB_ACR, amr: ["pop"], auth_time: clock.now, ...claims };
      return new SignJWT(body)
        .setProtectedHeader({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "k1" })
        .setIssuedAt(clock.now)
        .setExpirationTime(clock.now + 300)
        .setJti(crypto.randomUUID())
        .sign(opts.key ?? privateKey);
    },
    fetch: async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      const form = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
      idp.requests.push({ method: init?.method ?? "GET", url, headers: new Headers(init?.headers), form });
      return respond(idp, url, jwk);
    },
  };
  return idp;
}

function respond(idp: MockIdp, url: string, jwk: JWK): Response {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url === `${ISSUER}/.well-known/openid-configuration`) {
    return json(200, {
      issuer: ISSUER,
      device_authorization_endpoint: `${ISSUER}/api/v1/device_authorization`,
      token_endpoint: `${ISSUER}/api/v1/token`,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      id_token_signing_alg_values_supported: ["RS256"],
    });
  }
  if (url === `${ISSUER}/.well-known/jwks.json`) {
    if (!idp.jwksUp) throw new TypeError("fetch failed");
    return json(200, { keys: [jwk] });
  }
  const reply = url === `${ISSUER}/api/v1/device_authorization` ? idp.device : url === `${ISSUER}/api/v1/token` ? next(idp) : null;
  if (!reply) return json(404, { error: "not_found" });
  if (reply === "network") throw new TypeError("fetch failed");
  return json(reply.status, reply.body);
}

function next(idp: MockIdp): Reply {
  return idp.token.length > 1 ? idp.token.shift()! : idp.token[0]!;
}

export interface Harness {
  idp: MockIdp;
  client: Idp;
  approvals: ApprovalService;
  approvers: ApproverRegistry;
  waits: number[];
}

/** The approval service over the mock IdP. `wait` advances the mock clock instead of sleeping. */
export async function approvalHarness(opts: { allowed?: string[]; authMethod?: "client_secret_basic" | "client_secret_post"; hold?: boolean } = {}): Promise<Harness> {
  const idp = await mockIdp();
  const waits: number[] = [];
  const client = createIdp({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    authMethod: opts.authMethod ?? "client_secret_basic",
    fetch: idp.fetch,
    timeoutMs: 1_000,
  });
  const approvers = createApproverRegistry({ allowed: opts.allowed ?? [], path: null });
  const wait = async (ms: number) => {
    waits.push(ms);
    if (opts.hold) await new Promise<void>(() => {}); // never polls: the attempt stays pending
    idp.clock.now += ms / 1000;
  };
  const approvals = createApprovals({ idp: client, approvers, now: () => idp.clock.now, wait });
  return { idp, client, approvals, approvers, waits };
}
