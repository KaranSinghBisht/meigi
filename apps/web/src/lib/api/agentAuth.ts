// The agent can require a bearer token on its POSTs (AGENT_API_TOKEN, for serving it on a LAN). A browser
// bundle can't keep a secret, so the operator types it once: it is kept in memory and, where the browser
// allows it, in this tab's session storage so a reload doesn't ask again.

const KEY = 'meigi.agent.token'
let remembered: string | null = null

function stored(): string | null {
  try {
    return window.sessionStorage.getItem(KEY)
  } catch {
    return null // storage is blocked in this context; the in-memory copy still works
  }
}

export function saveAgentToken(token: string): void {
  remembered = token
  try {
    window.sessionStorage.setItem(KEY, token)
  } catch {
    // Not persisted across reloads when storage is blocked; the in-memory copy is used for this page.
  }
}

export function authHeaders(): Record<string, string> | undefined {
  const token = remembered ?? stored()
  return token ? { authorization: `Bearer ${token}` } : undefined
}
