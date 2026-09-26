// Client for the x402 demo's research-agent scenario (services/x402-demo): a buying agent needs 2 GPU-minutes
// and a dataset slice, and tries a compromised look-alike and an undeclared source along the way. Each step
// shows what the 402 declared, what ENS and the registry each say, and what the guard decided.

import { env } from '../env/env'
import { joinUrl, requestJson } from './http'
import { isRecord, optNum, optStr, record, str } from './parse'

export interface Declared {
  readonly tNumber: string
  readonly ens: string | null
}

export interface ScreeningView {
  readonly flagged: boolean
  readonly summary: string
}

export interface ScenarioStep {
  readonly label: string
  readonly method: string
  readonly path: string
  readonly amountAtomic: string | null
  readonly declared: Declared | null
  readonly resolvedEns: string | null
  readonly registryPayout: string | null
  readonly payTo: string | null
  readonly screening: ScreeningView | null
  readonly outcome: 'settled' | 'refused'
  readonly reason: string | null
  readonly txHash: string | null
}

export interface ScenarioResult {
  readonly startedAt: string
  readonly steps: readonly ScenarioStep[]
  readonly settledCount: number
  readonly refusedCount: number
  readonly spentAtomic: string
}

function parseDeclared(value: unknown): Declared | null {
  if (!isRecord(value)) return null
  const tNumber = optStr(value, 'tNumber')
  return tNumber ? { tNumber, ens: optStr(value, 'ens') } : null
}

function parseScreening(value: unknown): ScreeningView | null {
  return isRecord(value) ? { flagged: value.flagged === true, summary: optStr(value, 'summary') ?? '' } : null
}

function parseStep(value: unknown): ScenarioStep {
  const body = record(value, 'scenario step')
  return {
    label: str(body, 'label', 'scenario step'),
    method: str(body, 'method', 'scenario step'),
    path: str(body, 'path', 'scenario step'),
    amountAtomic: optStr(body, 'amountAtomic'),
    declared: parseDeclared(body.declared),
    resolvedEns: optStr(body, 'resolvedEns'),
    registryPayout: optStr(body, 'registryPayout'),
    payTo: optStr(body, 'payTo'),
    screening: parseScreening(body.screening),
    outcome: body.outcome === 'settled' ? 'settled' : 'refused',
    reason: optStr(body, 'reason'),
    txHash: optStr(body, 'txHash'),
  }
}

export function parseScenarioResult(value: unknown): ScenarioResult {
  const body = record(value, 'research agent run')
  const steps = Array.isArray(body.steps) ? body.steps.map(parseStep) : []
  const settled = steps.filter((s) => s.outcome === 'settled').length
  return {
    startedAt: str(body, 'startedAt', 'research agent run'),
    steps,
    settledCount: optNum(body, 'settledCount') ?? settled,
    refusedCount: optNum(body, 'refusedCount') ?? steps.length - settled,
    spentAtomic: optStr(body, 'spentAtomic') ?? '0',
  }
}

/** Runs the whole scenario against the local x402 demo: several signed payments, ~20-40 seconds. */
export async function runResearchAgent(): Promise<ScenarioResult> {
  const body = await requestJson(joinUrl(env.merchantUrl, '/scenario/research-agent'), {
    method: 'POST',
    timeoutMs: 120_000,
  })
  return parseScenarioResult(body)
}
