// The meigi Worker's bindings. MULTIBAAS_URL and MULTIBAAS_API_KEY are Worker secrets (`wrangler secret put`):
// they never ship in the bundle, the repo or a response. The rest are public vars (wrangler.landing.jsonc); a missing
// or malformed one makes /api/settlements answer 503 and log which.

export interface Env {
  readonly ASSETS: { fetch(request: Request): Promise<Response> }
  readonly MULTIBAAS_URL?: string
  readonly MULTIBAAS_API_KEY?: string
  /** The registered payees listed even before the vault or router pays them (x402 sellers), comma-separated. */
  readonly SETTLEMENT_PAYEES?: string
  /** The mJPYC the saved queries were made for: MultiBaas's meigi_mjpy alias must point at it. */
  readonly SETTLEMENT_TOKEN?: string
  /** The x402 research agent's wallet: only its mJPYC transfers count as x402 purchases (mJPYC is mintable). */
  readonly X402_BUYER?: string
}
