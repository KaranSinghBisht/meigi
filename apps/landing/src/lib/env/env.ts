// Reads and validates the public build-time env once. Nothing here is secret:
// every VITE_ value ships to the browser.

export type HexAddress = `0x${string}`

export interface RegistryConfig {
  readonly rpcUrl: string
  readonly address: HexAddress
  /** First block to scan for PayeeRegistered logs (the deployment block). */
  readonly fromBlock: bigint | null
}

export interface LandingEnv {
  readonly appUrl: string
  readonly githubUrl: string | null
  readonly docsUrl: string | null
  readonly registry: RegistryConfig | null
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const BLOCK_RE = /^\d{1,12}$/

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

/** Accepts absolute http(s) URLs and same-origin paths such as `/app`. */
function safeLink(value: string): string | null {
  // Browsers read both `//host` and `/\host` as protocol-relative, off-site links.
  const offSite = value.startsWith('//') || value.startsWith('/\\')
  if (value.startsWith('/') && !offSite) return value
  return isHttpUrl(value) ? value : null
}

function readRegistry(raw: ImportMetaEnv): RegistryConfig | null {
  const rpcUrl = clean(raw.VITE_RPC_URL)
  const address = clean(raw.VITE_REGISTRY_ADDRESS)
  if (!isHttpUrl(rpcUrl) || !ADDRESS_RE.test(address)) return null
  const block = clean(raw.VITE_REGISTRY_FROM_BLOCK)
  return {
    rpcUrl,
    address: address as HexAddress,
    fromBlock: BLOCK_RE.test(block) ? BigInt(block) : null,
  }
}

function readEnv(raw: ImportMetaEnv): LandingEnv {
  return {
    appUrl: safeLink(clean(raw.VITE_APP_URL)) ?? '/app',
    githubUrl: safeLink(clean(raw.VITE_GITHUB_URL)),
    docsUrl: safeLink(clean(raw.VITE_DOCS_URL)),
    registry: readRegistry(raw),
  }
}

export const env: LandingEnv = readEnv(import.meta.env)
