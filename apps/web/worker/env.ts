// The meigi Worker's bindings. MULTIBAAS_URL and MULTIBAAS_API_KEY are Worker secrets (`wrangler secret put`):
// they never ship in the bundle, the repo or a response.

export interface Env {
  readonly ASSETS: { fetch(request: Request): Promise<Response> }
  readonly MULTIBAAS_URL?: string
  readonly MULTIBAAS_API_KEY?: string
  /** T-numbers whose payouts' direct mJPYC transfers (x402 sales) count as settlements, comma-separated. */
  readonly SETTLEMENT_PAYEES?: string
}
