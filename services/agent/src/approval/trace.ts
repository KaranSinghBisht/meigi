import { decodeJwt, decodeProtectedHeader } from "jose";

/**
 * WORLD_AGENTS_TRACE: one stderr line per ID token the IdP issues, for rehearsals against a new IdP. It describes
 * the claims' shape, never an identifying value: no sub, no token. Off by default.
 */
export function traceIdToken(idToken: string, ctx: { issuer: string; clientId: string; startedAt: number }): void {
  let line: string;
  try {
    const header = decodeProtectedHeader(idToken);
    const c = decodeJwt(idToken);
    const authTime = typeof c.auth_time === "number" ? `attempt start ${signed(c.auth_time - ctx.startedAt)} s` : "missing";
    const lifetime = typeof c.exp === "number" && typeof c.iat === "number" ? `${c.exp - c.iat} s` : "exp or iat missing";
    line = [
      `alg ${clean(header.alg)}, kid ${header.kid ? "set" : "none"}`,
      `iss ${c.iss === ctx.issuer ? "matches" : `differs (${clean(c.iss)})`}`,
      `aud ${audShape(c.aud, ctx.clientId)}`,
      `acr ${clean(c.acr)}`,
      `amr ${clean(JSON.stringify(c.amr ?? null))}`,
      `sub ${subShape(c.sub)}`,
      `auth_time ${authTime}`,
      `lifetime ${lifetime}`,
      `claims [${Object.keys(c).sort().join(", ")}]`,
    ].join("; ");
  } catch {
    line = "not a decodable JWT";
  }
  process.stderr.write(`[agent] world id token: ${line}\n`);
}

function clean(value: unknown): string {
  return String(value ?? "none").replace(/[^\x20-\x7e]/gu, "?").slice(0, 80);
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function audShape(aud: unknown, clientId: string): string {
  if (aud === clientId) return "is our client id";
  if (Array.isArray(aud)) return `array of ${aud.length}${aud.includes(clientId) ? ", with our client id" : ""}`;
  return "differs";
}

/** Length and alphabet only. */
function subShape(sub: unknown): string {
  if (typeof sub !== "string") return "missing";
  const alphabet = /^0x[0-9a-f]+$/iu.test(sub)
    ? "0x + hex"
    : /^[0-9a-f]+$/u.test(sub)
      ? "lowercase hex"
      : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(sub)
        ? "uuid"
        : /^[A-Za-z0-9_-]+$/u.test(sub)
          ? "base64url alphabet"
          : `other (separators ${JSON.stringify([...new Set(sub.replace(/[A-Za-z0-9]/gu, ""))].join(""))})`;
  return `${sub.length} chars, ${alphabet}`;
}
