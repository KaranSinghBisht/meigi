/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VERIFIER_URL?: string
  readonly VITE_AGENT_URL?: string
  readonly VITE_MERCHANT_URL?: string
  readonly VITE_RPC_URL?: string
  readonly VITE_REGISTRY_ADDRESS?: string
  readonly VITE_REGISTRY_FROM_BLOCK?: string
  readonly VITE_VAULT_ADDRESS?: string
  readonly VITE_TOKEN_ADDRESS?: string
  readonly VITE_WORLD_APP_ID?: string
  readonly VITE_WORLD_ENVIRONMENT?: string
  readonly VITE_WORLD_RP_ID?: string
  readonly VITE_LANDING_URL?: string
  readonly VITE_GITHUB_URL?: string
  readonly VITE_DOCS_URL?: string
  readonly VITE_HOSTED?: string
  readonly VITE_DEMO_VIDEO_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
