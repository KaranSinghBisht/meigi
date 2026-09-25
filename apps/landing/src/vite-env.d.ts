/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL?: string
  readonly VITE_GITHUB_URL?: string
  readonly VITE_DOCS_URL?: string
  readonly VITE_RPC_URL?: string
  readonly VITE_REGISTRY_ADDRESS?: string
  readonly VITE_REGISTRY_DEPLOY_BLOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
