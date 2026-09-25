// JSON over fetch with a timeout. Every failure becomes an ApiError with a stable `code`, so screens can say
// something kind ("the verifier isn't running") instead of showing raw errors.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** The service could not be reached at all (not running, CORS, offline, timeout). */
  get unavailable(): boolean {
    return this.code === 'unavailable' || this.code === 'timeout'
  }
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST'
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function send(url: string, options: RequestOptions): Promise<Response> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers: { ...(options.body === undefined ? {} : { 'content-type': 'application/json' }), ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (timeout.aborted) throw new ApiError(0, 'timeout', 'The service took too long to answer.')
    throw new ApiError(0, 'unavailable', 'The service could not be reached.')
  }
}

/** Fetches JSON. Non-2xx responses throw ApiError with the server's `code`/`message` when it sent them. */
export async function requestJson(url: string, options: RequestOptions = {}): Promise<unknown> {
  const response = await send(url, options)
  const body: unknown = await response.json().catch(() => null)
  if (response.ok) {
    if (body === null) throw new ApiError(response.status, 'bad_response', 'The service sent an unreadable answer.')
    return body
  }
  if (isRecord(body)) {
    const { code, message, ...details } = body
    const safeCode = typeof code === 'string' ? code : `http_${response.status}`
    const safeMessage = typeof message === 'string' ? message : `Request failed (${response.status}).`
    throw new ApiError(response.status, safeCode, safeMessage, details)
  }
  throw new ApiError(response.status, `http_${response.status}`, `Request failed (${response.status}).`)
}

export function joinUrl(base: string, path: string): string {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
