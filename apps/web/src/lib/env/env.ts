// Reads and validates the public build-time env once. Nothing here is secret: every VITE_ value ships to
// the browser. Contract addresses default to the checked-in Sepolia deployment, so a redeploy that updates
// contracts/deployments/11155111.json needs no env change. A value that is set but invalid is reported in
// `configIssues` (shown in the footer) instead of being used.

import deployment from '../../../../../contracts/deployments/11155111.json'

export type HexAddress = `0x${string}`
export type WorldEnvironment = 'production' | 'staging' | 'sandbox'

export interface AppEnv {
  readonly verifierUrl: string
  readonly agentUrl: string
  readonly merchantUrl: string
  readonly rpcUrl: string
  readonly registry: HexAddress
  readonly registryFromBlock: bigint
  readonly vault: HexAddress
  readonly token: HexAddress
  readonly worldAppId: `app_${string}`
  readonly worldEnvironment: WorldEnvironment
  readonly worldRpId: string | null
  readonly landingUrl: string | null
  /** Optional links in the landing hero's dock. */
  readonly githubUrl: string | null
  readonly docsUrl: string | null
  /** Where "Talk to us" on /business writes to. The default is a placeholder on a reserved domain. */
  readonly contactEmail: string
  /** The public site: the verifier, agent and x402 demo only run on the demo machine. */
  readonly hosted: boolean
  readonly demoVideoUrl: string | null
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/** An address from the deployment file; a malformed file is a build problem, so it fails loudly. */
function deployed(key: 'registry' | 'vault' | 'token'): HexAddress {
  const value: unknown = (deployment as Record<string, unknown>)[key]
  if (typeof value !== 'string' || !ADDRESS_RE.test(value)) {
    throw new Error(`contracts/deployments/11155111.json has no valid "${key}" address`)
  }
  return value as HexAddress
}

const DEFAULTS = {
  verifierUrl: 'http://localhost:8787',
  agentUrl: 'http://localhost:8788',
  merchantUrl: 'http://localhost:8790',
  rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  registry: deployed('registry'),
  // The current registry's deployment block. An earlier block only makes the first log scan a little longer.
  registryFromBlock: 11781105n,
  vault: deployed('vault'),
  token: deployed('token'),
  worldAppId: 'app_30048059325fb60b495b43dd2fe67ae0',
  worldEnvironment: 'staging',
} as const

const BLOCK_RE = /^\d{1,12}$/
const WORLD_ENVIRONMENTS: readonly WorldEnvironment[] = ['production', 'staging', 'sandbox']

const issues: string[] = []

function clean(value: string | undefined): string {
  return (value ?? '').trim()
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/** Returns the parsed value, the default when unset, or the default plus a recorded issue when invalid. */
function pick<T>(name: string, raw: string | undefined, fallback: T, parse: (value: string) => T | null): T {
  const value = clean(raw)
  if (value === '') return fallback
  const parsed = parse(value)
  if (parsed !== null) return parsed
  issues.push(`${name} is not valid; using the default.`)
  return fallback
}

const url = (value: string) => (isHttpUrl(value) ? value.replace(/\/+$/, '') : null)
const address = (value: string) => (ADDRESS_RE.test(value) ? (value as HexAddress) : null)
const block = (value: string) => (BLOCK_RE.test(value) ? BigInt(value) : null)
const appId = (value: string) => (value.startsWith('app_') ? (value as `app_${string}`) : null)
const worldEnv = (value: string) => WORLD_ENVIRONMENTS.find((item) => item === value) ?? null
const rpId = (value: string) => (value.startsWith('rp_') ? value : null)
/** An absolute http(s) URL or a same-origin path such as "/" (never protocol-relative "//host"). */
const link = (value: string) => (value.startsWith('/') && !value.startsWith('//') ? value : url(value))
const email = (value: string) => (/^[^\s@/?#]+@[^\s@/?#]+\.[a-z]{2,}$/i.test(value) ? value : null)
const flag = (value: string) => (['1', 'true'].includes(value) ? true : ['0', 'false'].includes(value) ? false : null)

function readEnv(raw: ImportMetaEnv): AppEnv {
  return {
    verifierUrl: pick('VITE_VERIFIER_URL', raw.VITE_VERIFIER_URL, DEFAULTS.verifierUrl, url),
    agentUrl: pick('VITE_AGENT_URL', raw.VITE_AGENT_URL, DEFAULTS.agentUrl, url),
    merchantUrl: pick('VITE_MERCHANT_URL', raw.VITE_MERCHANT_URL, DEFAULTS.merchantUrl, url),
    rpcUrl: pick('VITE_RPC_URL', raw.VITE_RPC_URL, DEFAULTS.rpcUrl, url),
    registry: pick('VITE_REGISTRY_ADDRESS', raw.VITE_REGISTRY_ADDRESS, DEFAULTS.registry, address),
    registryFromBlock: pick(
      'VITE_REGISTRY_FROM_BLOCK',
      raw.VITE_REGISTRY_FROM_BLOCK,
      DEFAULTS.registryFromBlock,
      block,
    ),
    vault: pick('VITE_VAULT_ADDRESS', raw.VITE_VAULT_ADDRESS, DEFAULTS.vault, address),
    token: pick('VITE_TOKEN_ADDRESS', raw.VITE_TOKEN_ADDRESS, DEFAULTS.token, address),
    worldAppId: pick('VITE_WORLD_APP_ID', raw.VITE_WORLD_APP_ID, DEFAULTS.worldAppId, appId),
    worldEnvironment: pick('VITE_WORLD_ENVIRONMENT', raw.VITE_WORLD_ENVIRONMENT, DEFAULTS.worldEnvironment, worldEnv),
    worldRpId: pick<string | null>('VITE_WORLD_RP_ID', raw.VITE_WORLD_RP_ID, null, rpId),
    landingUrl: pick<string | null>('VITE_LANDING_URL', raw.VITE_LANDING_URL, null, link),
    githubUrl: pick<string | null>('VITE_GITHUB_URL', raw.VITE_GITHUB_URL, null, link),
    docsUrl: pick<string | null>('VITE_DOCS_URL', raw.VITE_DOCS_URL, null, link),
    contactEmail: pick('VITE_CONTACT_EMAIL', raw.VITE_CONTACT_EMAIL, 'hello@meigi.example', email),
    hosted: pick('VITE_HOSTED', raw.VITE_HOSTED, false, flag),
    demoVideoUrl: pick<string | null>('VITE_DEMO_VIDEO_URL', raw.VITE_DEMO_VIDEO_URL, null, url),
  }
}

export const env: AppEnv = readEnv(import.meta.env)

/** Human-readable problems with the configured env, for the footer. Empty when everything parsed. */
export const configIssues: readonly string[] = issues
