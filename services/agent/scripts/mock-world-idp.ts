import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { ORB_ACR } from "../src/approval/token.js";

/**
 * `pnpm mock:idp`: a local stand-in for the World ID for Agents IdP, so the console's approval states can be
 * exercised without World App. Development only; it proves nothing about anyone.
 *
 * Point an agent at it with WORLD_AGENTS_ISSUER=http://127.0.0.1:8791 (http is accepted for loopback only) and
 * WORLD_AGENTS_CLIENT_ID / WORLD_AGENTS_CLIENT_SECRET = MOCK_IDP_CLIENT_ID / MOCK_IDP_CLIENT_SECRET. The page at
 * verification_uri_complete approves, approves as a different person (wrong_human), denies, or expires the request.
 */

const PORT = Number(process.env.MOCK_IDP_PORT ?? 8791);
const ISSUER = `http://127.0.0.1:${PORT}`;
const CLIENT_ID = process.env.MOCK_IDP_CLIENT_ID ?? "mock-client";
const CLIENT_SECRET = process.env.MOCK_IDP_CLIENT_SECRET ?? "mock-secret";
const EXPIRES_IN = Number(process.env.MOCK_IDP_EXPIRES_IN ?? 1200);
const INTERVAL = Number(process.env.MOCK_IDP_INTERVAL ?? 5);
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const SUBJECTS = { approve: "mock-human-approver", intruder: "mock-human-intruder" } as const;

type State = "pending" | "approved" | "denied" | "expired" | "redeemed";

interface Grant {
  deviceCode: string;
  userCode: string;
  expiresAt: number;
  state: State;
  sub?: string;
  authTime?: number;
}

const grants = new Map<string, Grant>(); // by device code
const byUserCode = new Map<string, Grant>();
const now = () => Math.floor(Date.now() / 1000);
const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "mock-1", alg: "RS256", use: "sig" };

const app = new Hono();

app.get("/.well-known/openid-configuration", (c) =>
  c.json({
    issuer: ISSUER,
    device_authorization_endpoint: `${ISSUER}/api/v1/device_authorization`,
    token_endpoint: `${ISSUER}/api/v1/token`,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    grant_types_supported: [DEVICE_GRANT],
    id_token_signing_alg_values_supported: ["RS256"],
    acr_values_supported: [ORB_ACR],
    scopes_supported: ["openid"],
  }),
);

app.get("/.well-known/jwks.json", (c) => c.json({ keys: [jwk] }));

app.post("/api/v1/device_authorization", async (c) => {
  const form = new URLSearchParams(await c.req.text());
  if (!clientOk(c, form)) return c.json({ error: "invalid_client" }, 401);
  if (form.get("scope") !== "openid") return c.json({ error: "invalid_scope" }, 400);
  const grant: Grant = { deviceCode: randomBytes(32).toString("base64url"), userCode: userCode(), expiresAt: now() + EXPIRES_IN, state: "pending" };
  grants.set(grant.deviceCode, grant);
  byUserCode.set(grant.userCode, grant);
  return c.json({
    device_code: grant.deviceCode,
    user_code: grant.userCode,
    verification_uri: `${ISSUER}/device`,
    verification_uri_complete: `${ISSUER}/device?user_code=${grant.userCode}`,
    expires_in: EXPIRES_IN,
    interval: INTERVAL,
  });
});

app.post("/api/v1/token", async (c) => {
  const form = new URLSearchParams(await c.req.text());
  if (!clientOk(c, form)) return c.json({ error: "invalid_client" }, 401);
  if (form.get("grant_type") !== DEVICE_GRANT) return c.json({ error: "unsupported_grant_type" }, 400);
  const grant = grants.get(form.get("device_code") ?? "");
  if (!grant || grant.state === "redeemed") return c.json({ error: "invalid_grant" }, 400);
  if (grant.state === "expired" || now() >= grant.expiresAt) return c.json({ error: "expired_token" }, 400);
  if (grant.state === "denied") return c.json({ error: "access_denied" }, 400);
  if (grant.state === "pending") return c.json({ error: "authorization_pending" }, 400);
  grant.state = "redeemed"; // a device code is redeemed once
  return c.json({ access_token: randomUUID(), token_type: "Bearer", expires_in: 300, id_token: await idToken(grant) });
});

app.get("/device", (c) => c.html(page(findGrant(c.req.query("user_code")), null)));

app.post("/device", async (c) => {
  const form = new URLSearchParams(await c.req.text());
  const grant = findGrant(form.get("user_code") ?? undefined);
  return c.html(page(grant, grant ? decide(grant, form.get("action") ?? "") : null));
});

serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" });
process.stderr.write(`[mock-idp] mock World ID IdP at ${ISSUER} (client ${CLIENT_ID}); development only\n`);

function clientOk(c: Context, form: URLSearchParams): boolean {
  const header = c.req.header("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [id, secret] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":").map((part) => decodeURIComponent(part));
      return id === CLIENT_ID && secret === CLIENT_SECRET;
    } catch {
      return false; // malformed percent-encoding
    }
  }
  return form.get("client_id") === CLIENT_ID && form.get("client_secret") === CLIENT_SECRET;
}

function userCode(): string {
  const alphabet = "BCDFGHJKLMNPQRSTVWXZ";
  const pick = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${pick()}-${pick()}`;
}

function findGrant(code: string | undefined): Grant | null {
  const normalized = (code ?? "").trim().toUpperCase();
  return /^[A-Z]{4}-[A-Z]{4}$/u.test(normalized) ? (byUserCode.get(normalized) ?? null) : null;
}

function decide(grant: Grant, action: string): string {
  if (grant.state !== "pending" || now() >= grant.expiresAt) return "This request is no longer pending.";
  if (action === "approve" || action === "intruder") {
    grant.state = "approved";
    grant.sub = SUBJECTS[action];
    grant.authTime = now();
    return action === "approve" ? "Approved as mock-human-approver." : "Approved as mock-human-intruder, a different person.";
  }
  if (action === "deny") grant.state = "denied";
  if (action === "expire") grant.state = "expired";
  return grant.state === "pending" ? "Unknown action." : `Marked ${grant.state}.`;
}

async function idToken(grant: Grant): Promise<string> {
  return new SignJWT({ acr: ORB_ACR, amr: ["pop"], auth_time: grant.authTime })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setSubject(grant.sub ?? SUBJECTS.approve)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti(randomUUID())
    .sign(privateKey);
}

/** The "World App" screen. Only fixed text and a validated [A-Z-] user code are interpolated. */
function page(grant: Grant | null, notice: string | null): string {
  const body = !grant
    ? `<form method="get"><p>Enter the code shown by the agent console.</p><input name="user_code" placeholder="ABCD-EFGH"> <button>Continue</button></form>`
    : `<p>Meigi AP agent (<code>${CLIENT_ID.replace(/[^\w.-]/gu, "")}</code>) asks you to approve one held payment.</p>
<p class="code">${grant.userCode}</p><p>Status: <b>${grant.state}</b></p>
<form method="post"><input type="hidden" name="user_code" value="${grant.userCode}">
<button name="action" value="approve">Approve</button>
<button name="action" value="intruder">Approve as someone else</button>
<button name="action" value="deny">Deny</button>
<button name="action" value="expire">Expire</button></form>
<p class="note">The agent's first approval enrolls the approver (trust on first use); after that, "someone else" is wrong_human.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mock World ID</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem}
.code{font:600 2rem ui-monospace,monospace;letter-spacing:.1em}.note{color:#666;font-size:.9rem}button{margin:.25rem .25rem 0 0;padding:.5rem .8rem}
.banner{background:#fff3cd;padding:.5rem .75rem;border-radius:.4rem}</style></head><body>
<p class="banner">Mock World ID IdP for local development. It is not World App and proves nothing.</p>
${notice ? `<p><b>${notice}</b></p>` : ""}${body}</body></html>`;
}
