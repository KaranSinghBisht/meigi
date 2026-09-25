import { errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { IdpUnavailable } from "./idp.js";

/** The Orb-verified World ID assurance level the ID token must carry. */
export const ORB_ACR = "https://world.org/oidc/acr/orb-v3";
/** Clock skew allowed for exp and auth_time. */
const SKEW_SECONDS = 30;

export class TokenRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenRejected";
  }
}

export interface ValidationContext {
  keys: JWTVerifyGetKey;
  issuer: string;
  clientId: string;
  startedAt: number; // unix seconds: when this approval attempt began
  now: number; // unix seconds
}

/**
 * Validates a device-grant ID token: RS256 against the IdP's keys, the exact issuer, our client as the only
 * audience, not expired, Orb-level World ID, and a proof made during this attempt (auth_time, never iat).
 * Returns the pairwise subject: the same human always has the same sub for us. Throws TokenRejected, or
 * IdpUnavailable when the keys can't be fetched.
 */
export async function validateIdToken(idToken: string, ctx: ValidationContext): Promise<{ sub: string; authTime: number }> {
  const payload = await verifySignature(idToken, ctx);
  const aud = payload.aud;
  if (!(aud === ctx.clientId || (Array.isArray(aud) && aud.length === 1 && aud[0] === ctx.clientId))) {
    throw new TokenRejected("the ID token is for another client");
  }
  if (payload.acr !== ORB_ACR) throw new TokenRejected("the ID token is not an Orb-verified World ID");
  const authTime = payload.auth_time;
  if (typeof authTime !== "number") throw new TokenRejected("the ID token has no auth_time");
  if (authTime < ctx.startedAt - SKEW_SECONDS) throw new TokenRejected("the proof predates this approval request");
  if (authTime > ctx.now + SKEW_SECONDS) throw new TokenRejected("the proof is dated in the future");
  if (typeof payload.sub !== "string" || payload.sub.length === 0) throw new TokenRejected("the ID token has no subject");
  return { sub: payload.sub, authTime };
}

async function verifySignature(idToken: string, ctx: ValidationContext): Promise<Record<string, unknown>> {
  try {
    const { payload } = await jwtVerify(idToken, ctx.keys, {
      issuer: ctx.issuer,
      audience: ctx.clientId,
      algorithms: ["RS256"],
      clockTolerance: SKEW_SECONDS,
      currentDate: new Date(ctx.now * 1000),
    });
    return payload;
  } catch (error) {
    if (error instanceof errors.JWKSTimeout || !(error instanceof errors.JOSEError)) {
      throw new IdpUnavailable("the World ID provider's signing keys could not be fetched");
    }
    if (error instanceof errors.JWTExpired) throw new TokenRejected("the ID token has expired");
    if (error instanceof errors.JWTClaimValidationFailed) throw new TokenRejected(`the ID token's ${error.claim} claim is wrong`);
    throw new TokenRejected(`the ID token failed verification (${error.code})`);
  }
}
