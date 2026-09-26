// The meigi Worker's bindings. MULTIBAAS_URL and MULTIBAAS_API_KEY are Worker secrets (`wrangler secret put`):
// they never ship in the bundle, the repo or a response.

export interface Env {
  readonly ASSETS: { fetch(request: Request): Promise<Response> }
  readonly MULTIBAAS_URL?: string
  readonly MULTIBAAS_API_KEY?: string
  /** The registered payees listed even before the vault or router pays them (x402 sellers), comma-separated. */
  readonly SETTLEMENT_PAYEES?: string
  /** The x402 research agent's wallet: only its mJPYC transfers count as x402 purchases (mJPYC is mintable). */
  readonly X402_BUYER?: string
}
