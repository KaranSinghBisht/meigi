// Reads a recorded research-agent run (services/x402-demo: `scripts/research-agent.ts --json`, a ScenarioResult)
// into the player's X402Run. The guard rows are the recorded facts (the 402's declaration, what its ens name and
// the registry answered, payTo, the screen); the outcome is the guard's own recorded verdict.

import { formatTokenAmount, shortAddress } from '../../../lib/chain/format'
import type { GuardCheck, X402Purchase, X402Run } from './x402'

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** The most the guard pays a merchant that declares no Meigi payee (services/x402-demo config). */
const UNDECLARED_CAP = '50 mJPYC'

function fail(what: string): never {
  throw new Error(`the recorded x402 run has no valid ${what}`)
}

const short = (address: string | null): string => (address ? shortAddress(address) : 'nothing')
const same = (a: string | null, b: string | null): boolean => !!a && !!b && a.toLowerCase() === b.toLowerCase()

function price(atomic: string | null): string | null {
  if (!atomic || !/^\d{1,78}$/.test(atomic)) return null
  return `${formatTokenAmount(BigInt(atomic))} mJPYC`
}

function declaredChecks(step: Json, declared: { tNumber: string; ens: string | null }): GuardCheck[] {
  const resolved = text(step.resolvedEns)
  const payout = text(step.registryPayout)
  const payTo = text(step.payTo)
  const checks: GuardCheck[] = []
  if (declared.ens) {
    const state = resolved ? 'pass' : 'fail'
    checks.push({ label: 'ENS name resolves', state, detail: `${declared.ens} → ${short(resolved)}` })
  }
  const registry = payout ? `${declared.tNumber} pays ${short(payout)}` : `${declared.tNumber} is not active`
  checks.push({ label: 'Registry', state: payout ? 'pass' : 'fail', detail: registry })
  const matches = same(payTo, payout) && (!declared.ens || same(resolved, payout))
  checks.push({ label: 'payTo matches', state: matches ? 'pass' : 'fail', detail: `payTo ${short(payTo)}` })
  return checks
}

function checksOf(step: Json, declared: { tNumber: string; ens: string | null } | null): GuardCheck[] {
  const checks: GuardCheck[] = declared
    ? declaredChecks(step, declared)
    : [{ label: 'Declares a payee', state: 'skip' as const, detail: `no Meigi record: at most ${UNDECLARED_CAP}` }]
  const screening = isRecord(step.screening) ? step.screening : null
  if (screening) {
    const flagged = screening.flagged === true
    checks.push({ label: 'Screening', state: flagged ? 'fail' : 'pass', detail: text(screening.summary) ?? '' })
  }
  return checks
}

function declaredOf(step: Json): { tNumber: string; ens: string | null } | null {
  if (!isRecord(step.declared)) return null
  const tNumber = text(step.declared.tNumber) ?? fail('declared T-number')
  return { tNumber, ens: text(step.declared.ens) }
}

function purchase(step: unknown, index: number): X402Purchase {
  if (!isRecord(step)) fail(`step ${index + 1}`)
  const declared = declaredOf(step)
  const settled = step.outcome === 'settled'
  if (!settled && step.outcome !== 'refused') fail(`outcome for step ${index + 1}`)
  return {
    id: `step-${index}`,
    title: text(step.label) ?? fail(`label for step ${index + 1}`),
    request: `${text(step.method) ?? 'GET'} ${text(step.path) ?? ''}`,
    price: price(text(step.amountAtomic)),
    declared,
    payTo: short(text(step.payTo)),
    checks: checksOf(step, declared),
    outcome: settled
      ? { status: 'settled', txHash: text(step.txHash) }
      : { status: 'refused', reason: text(step.reason) ?? 'refused by the guard' },
  }
}

/** A recorded ScenarioResult as the player's run; anything malformed is an error, not a quiet gap. */
export function fromScenario(json: unknown, buyer = 'research-agent'): X402Run {
  if (!isRecord(json) || !Array.isArray(json.steps) || json.steps.length === 0) fail('steps')
  return {
    recordedAt: text(json.startedAt),
    buyer,
    purchases: json.steps.map(purchase),
  }
}
