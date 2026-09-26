import { z } from "zod";
import { IdpUnavailable, type Idp } from "./idp.js";

/** RFC 8628 device authorization grant against the World ID provider, scope exactly "openid". */

/** The IdP's device codes live 20 minutes; an attempt never outlives that, whatever the IdP says. */
export const MAX_ATTEMPT_SECONDS = 20 * 60;
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export interface DeviceStart {
  deviceCode: string; // server-side only: never returned to a caller
  userCode: string;
  verificationUriComplete: string;
  expiresIn: number; // seconds
  interval: number; // seconds between polls
}

export type Poll =
  | { kind: "pending" }
  | { kind: "slow_down" }
  | { kind: "approved"; idToken: string }
  | { kind: "denied"; reason: string }
  | { kind: "expired" }
  | { kind: "unavailable"; reason: string };

const startSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1).max(64),
  verification_uri: z.url(),
  verification_uri_complete: z.url().optional(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive().optional(),
});

export async function startDevice(idp: Idp): Promise<DeviceStart> {
  const { device_authorization_endpoint } = await idp.discovery();
  const { status, body } = await idp.post(device_authorization_endpoint, { scope: "openid" });
  if (status !== 200) throw new IdpUnavailable(`device authorization failed (${status})`);
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) throw new IdpUnavailable("device authorization returned an unusable response");
  const d = parsed.data;
  const complete = d.verification_uri_complete ?? `${d.verification_uri}?user_code=${encodeURIComponent(d.user_code)}`;
  return {
    deviceCode: d.device_code,
    userCode: d.user_code,
    verificationUriComplete: complete,
    expiresIn: Math.min(d.expires_in, MAX_ATTEMPT_SECONDS),
    interval: d.interval ?? 5,
  };
}

/** One token request. Only an ID token is an approval; every error but pending/slow_down stops the attempt. */
export async function pollOnce(idp: Idp, deviceCode: string): Promise<Poll> {
  let result: { status: number; body: Record<string, unknown> };
  try {
    const { token_endpoint } = await idp.discovery();
    result = await idp.post(token_endpoint, { grant_type: DEVICE_GRANT, device_code: deviceCode });
  } catch (error) {
    if (error instanceof IdpUnavailable) return { kind: "unavailable", reason: error.message };
    throw error;
  }
  const { status, body } = result;
  if (status === 200) {
    return typeof body.id_token === "string" ? { kind: "approved", idToken: body.id_token } : { kind: "denied", reason: "no ID token was issued" };
  }
  if (status >= 500) return { kind: "unavailable", reason: `the World ID provider answered ${status}` };
  const error = typeof body.error === "string" ? body.error : "";
  if (error === "authorization_pending") return { kind: "pending" };
  if (error === "slow_down") return { kind: "slow_down" };
  if (error === "expired_token") return { kind: "expired" };
  if (error === "access_denied") return { kind: "denied", reason: "the person declined in the World ID app" };
  // invalid_grant and anything else stops too. Only a plain OAuth error code is repeated to the caller.
  const code = /^[a-z_]{1,40}$/u.test(error) ? error : `an error (${status})`;
  return { kind: "denied", reason: `the World ID provider returned ${code}` };
}
