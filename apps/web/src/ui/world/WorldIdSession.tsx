import {
  useIDKitSession,
  type IDKitResultSession,
  type RpContext,
  type UseIDKitSessionHookResult,
} from '@worldcoin/idkit'
import { useEffect, useRef, useState } from 'react'
import { env } from '../../lib/env/env'
import { credentialLabel, officerConstraint } from '../../lib/world/credentials'
import { widgetOutcome, type WidgetOutcome } from '../../lib/world/rpContext'
import { Button } from '../components/Button'
import { CopyButton } from '../components/CopyButton'
import { Spinner } from '../components/Spinner'
import { useQr } from './useQr'
import './world.css'

const APPS = {
  production: 'World ID',
  sandbox: 'the World ID Sandbox app',
  staging: 'the World ID staging app',
} as const

interface WorldIdSessionProps {
  readonly context: RpContext
  readonly signal: string
  readonly sessionId?: `session_${string}`
  /** What this proof would do if completed, e.g. "added" (an officer) or "approved" (a change) - named in the
   * decline/cancel/timeout message, so it reads correctly wherever this component is used. */
  readonly consequence: string
  readonly onProof: (result: IDKitResultSession) => Promise<void>
  readonly onFinish: (problem: WidgetOutcome | null) => void
}

/** Hands a confirmed proof to `onProof` once, and ends the session on any World ID failure. */
function useHandoff(flow: UseIDKitSessionHookResult, props: WorldIdSessionProps) {
  const { onProof, onFinish } = props
  const [verifying, setVerifying] = useState(false)
  const handled = useRef<IDKitResultSession | null>(null)
  useEffect(() => {
    if (!flow.isSuccess || !flow.result || handled.current === flow.result) return
    handled.current = flow.result
    setVerifying(true)
    // A refusal is explained by the caller (it knows why, e.g. "not the same human"), so both outcomes close.
    onProof(flow.result).then(
      () => onFinish(null),
      () => onFinish(null),
    )
  }, [flow.isSuccess, flow.result, onProof, onFinish])
  useEffect(() => {
    if (flow.isError && flow.errorCode) onFinish(widgetOutcome(flow.errorCode, props.consequence))
  }, [flow.isError, flow.errorCode, onFinish, props.consequence])
  return verifying
}

const STALE_AFTER_MS = 150_000 // 2.5 minutes: World App can fail silently on its own side, with nothing sent
// back through the bridge - the person shouldn't be left guessing whether it's still trying.

/** True once `connectorURI` has sat unresolved for `STALE_AFTER_MS`; resets the moment the QR changes (a fresh
 * `open()`, e.g. after Cancel then trying again) or the session resolves. */
function useStaleAfter(connectorURI: string | null, resolved: boolean): boolean {
  const [stale, setStale] = useState(false)
  useEffect(() => {
    setStale(false)
    if (!connectorURI || resolved) return
    const timer = setTimeout(() => setStale(true), STALE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [connectorURI, resolved])
  return stale
}

function statusText(flow: UseIDKitSessionHookResult, verifying: boolean, sameHuman: boolean): string {
  const app = APPS[env.worldEnvironment]
  if (verifying) return 'Checking the proof with the Meigi verifier…'
  if (flow.isInWorldApp || flow.isAwaitingUserConfirmation) return `Confirm in ${app}…`
  if (flow.connectorURI)
    return `Scan with ${app} to prove you are ${sameHuman ? 'the same human who enrolled' : 'a unique human'} (${credentialLabel()}).`
  return 'Preparing the World ID request…'
}

/** The live World ID request: QR code, link, and where it stands. */
export function WorldIdSession(props: WorldIdSessionProps) {
  const flow = useIDKitSession({
    app_id: env.worldAppId,
    rp_context: props.context,
    environment: env.worldEnvironment,
    constraints: officerConstraint(props.signal),
    existing_session_id: props.sessionId,
    action_description: props.sessionId ? 'Approve a Meigi change' : 'Enroll as a company officer on Meigi',
    polling: { interval: 1500, timeout: 300_000 },
  })
  const { open } = flow
  useEffect(() => open(), [open])
  const verifying = useHandoff(flow, props)
  const qr = useQr(flow.connectorURI)
  const resolved = flow.isSuccess || flow.isError || verifying
  const stale = useStaleAfter(flow.connectorURI, resolved)
  const waiting = !flow.connectorURI || flow.isAwaitingUserConfirmation || verifying
  return (
    <div className="world-session" role="group" aria-label="World ID request">
      <div className="world-session__qr">
        {qr.src && !verifying ? (
          <img src={qr.src} alt="QR code for the World ID request" width={168} height={168} />
        ) : null}
        {!qr.src && !qr.failed ? <Spinner /> : null}
        {qr.failed ? <p className="muted">Couldn't draw the QR code; use the link.</p> : null}
      </div>
      <div className="world-session__body">
        <p className="world-session__status" aria-live="polite">
          {waiting ? <Spinner /> : null} {statusText(flow, verifying, Boolean(props.sessionId))}
        </p>
        {stale && !resolved ? (
          <p className="muted" role="status">
            No answer from World ID yet. Try again, or cancel below.
          </p>
        ) : null}
        <WorldIdLinks
          uri={flow.connectorURI}
          onCancel={() => props.onFinish(widgetOutcome('cancelled', props.consequence))}
          onRetry={stale && !resolved ? open : undefined}
        />
        {env.worldEnvironment === 'staging' ? (
          <p className="world-session__hint">
            Staging: the World ID simulator rejects World ID 4.0 sessions. Use the sandbox or production environment.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function WorldIdLinks({
  uri,
  onCancel,
  onRetry,
}: {
  readonly uri: string | null
  readonly onCancel: () => void
  readonly onRetry?: () => void
}) {
  return (
    <div className="world-session__links">
      {uri ? (
        <a className="btn btn--ghost btn--sm" href={uri} target="_blank" rel="noreferrer">
          Open in World ID <span aria-hidden="true">↗</span>
        </a>
      ) : null}
      {uri ? <CopyButton value={uri} label="Copy link" /> : null}
      {onRetry ? (
        <Button variant="quiet" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
      <Button variant="quiet" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
