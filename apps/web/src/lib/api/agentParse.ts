// Tolerant readers for the agent's JSON. The id and verdict must be present; any other section that is
// missing or malformed degrades to an explicit "unavailable" state instead of breaking the console.

import type {
  Analysis,
  Check,
  Explanation,
  Extraction,
  Flag,
  Kernel,
  Money,
  PayOutcome,
  Proposal,
  Reason,
  Screening,
  Severity,
  Triage,
} from './agentTypes'
import { bad, isRecord, str, type Json } from './parse'
import { redactAnalysis, redactOutcome, redactPendingNotice } from './redact'

const text = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const records = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isRecord) : [])
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const severity = (v: unknown): Severity => (v === 'warn' ? 'warn' : 'block')
const obj = (v: unknown): Json => (isRecord(v) ? v : {})

function money(v: unknown): Money | null {
  if (!isRecord(v)) return null
  const display = text(v.display)
  return display ? { value: text(v.value) ?? '', display } : null
}

function flag(v: Json): Flag {
  const code = text(v.code) ?? 'unknown'
  const message = redactPendingNotice(code, text(v.message) ?? '')
  return { code, severity: severity(v.severity), message, evidence: text(v.evidence) }
}

export function reason(v: Json): Reason {
  return { ...flag(v), layer: text(v.layer) ?? 'kernel', revert: text(v.revert) }
}

function check(v: Json): Check {
  return { ...flag(v), ok: v.ok === true, revert: text(v.revert) }
}

function extraction(v: unknown): Extraction {
  const e = obj(v)
  return {
    kind: text(e.kind) ?? 'document',
    tNumber: text(e.tNumber),
    claimedName: text(e.claimedName),
    address: text(e.address),
    addresses: strings(e.addresses),
    amount: money(e.amount),
    invoiceNumber: text(e.invoiceNumber),
    dueDate: text(e.dueDate),
    flags: records(e.flags).map(flag),
  }
}

function triage(v: unknown): Triage {
  const t = obj(v)
  if (t.status !== 'ok') {
    return {
      status: 'unavailable',
      attempts: records(t.attempts).map((a) => `${text(a.backend) ?? '?'}: ${text(a.error) ?? 'failed'}`),
    }
  }
  const request = obj(t.requestType)
  const suspicion = obj(t.suspicion)
  return {
    status: 'ok',
    backend: text(t.backend) ?? 'unknown',
    model: text(t.model),
    latencyMs: num(t.latencyMs),
    requestType: { value: text(request.value) ?? 'other', confidence: num(request.confidence) },
    newDestination: num(t.newDestination),
    pressure: num(t.pressure),
    suspicion: { score: num(suspicion.score), level: text(suspicion.level) ?? '' },
    pSafe: typeof t.pSafe === 'number' ? t.pSafe : null,
    minPSafe: typeof t.minPSafe === 'number' ? t.minPSafe : null,
    route: t.route === 'auto_clear' ? 'auto_clear' : 'hold',
    holdReasons: strings(t.holdReasons),
  }
}

function proposal(v: unknown): Proposal {
  const p = obj(v)
  if (p.status !== 'ok') {
    return { status: 'unavailable', provider: text(p.provider) ?? 'none', message: text(p.message) ?? 'no proposal' }
  }
  return {
    status: 'ok',
    provider: text(p.provider) ?? 'llm',
    model: text(p.model) ?? '',
    tNumber: text(p.tNumber),
    payTo: text(p.payTo),
    amount: text(p.amount),
    wouldPay: p.wouldPay === true,
    reasoning: text(p.reasoning) ?? '',
  }
}

function kernel(v: unknown): Kernel {
  const k = obj(v)
  const intent = isRecord(k.intent) ? k.intent : null
  const payee = isRecord(k.payee) ? k.payee : null
  const payeeStatus = payee ? (text(payee.status) ?? 'none') : 'none'
  return {
    status: text(k.status) ?? 'unknown',
    ok: k.ok === true,
    intent: intent && {
      source: text(intent.source) ?? 'extraction',
      tNumber: text(intent.tNumber) ?? '',
      payTo: text(intent.payTo),
      amount: money(intent.amount)?.display ?? '',
      invoiceNumber: text(intent.invoiceNumber) ?? '',
    },
    payee: payee && {
      tNumber: text(payee.tNumber) ?? '',
      status: payeeStatus,
      // Like the registry reads: a disputed payee's name is never shown, only its status.
      legalName: payeeStatus === 'active' ? text(payee.legalName) : null,
      registeredPayout: text(payee.registeredPayout),
      changePending: payee.changePending === true,
      pendingEffectiveAt: typeof payee.pendingEffectiveAt === 'number' ? payee.pendingEffectiveAt : null,
    },
    checks: records(k.checks).map(check),
    reasons: records(k.reasons).map(reason),
  }
}

function screening(v: unknown): Screening {
  const s = obj(v)
  if (s.status === 'not_configured') return { status: 'not_configured', reason: text(s.reason) ?? 'no screening key' }
  if (s.status !== 'ok') return { status: 'unavailable', reason: text(s.reason) ?? 'screening unavailable' }
  return {
    status: 'ok',
    results: records(s.results).map((r) => ({
      address: text(r.address) ?? '',
      flagged: r.flagged === true,
      toxicScore: num(r.toxicScore),
      traits: records(r.traits)
        .map((t) => text(t.name) ?? '')
        .filter(Boolean),
    })),
    errors: records(s.errors).map((e) => `${text(e.address) ?? '?'}: ${text(e.error) ?? 'failed'}`),
  }
}

export function explanation(v: unknown): Explanation {
  const e = obj(v)
  return { source: text(e.source) ?? 'template', text: text(e.text) ?? '', model: text(e.model) }
}

export function parseAnalysis(body: Json): Analysis {
  const verdict = obj(body.verdict)
  if (verdict.decision !== 'pay' && verdict.decision !== 'hold') throw bad('analysis')
  const analysis: Analysis = {
    id: str(body, 'id', 'analysis'),
    extracted: extraction(body.extracted),
    triage: triage(body.triage),
    proposal: proposal(body.proposal),
    kernel: kernel(body.kernel),
    screening: screening(body.screening),
    verdict: {
      decision: verdict.decision,
      reasons: records(verdict.reasons).map(reason),
      warnings: records(verdict.warnings).map(reason),
    },
    explanation: explanation(body.explanation),
    totalMs: typeof obj(body.timings).totalMs === 'number' ? num(obj(body.timings).totalMs) : null,
    // An agent without the feature sends nothing here: no button, and nothing to explain.
    approval: { enabled: obj(body.approval).enabled === true, approvable: obj(body.approval).approvable === true },
  }
  return redactAnalysis(analysis)
}

export function parsePayOutcome(body: Json): PayOutcome {
  return redactOutcome(readPayOutcome(body))
}

function readPayOutcome(body: Json): PayOutcome {
  if (body.status === 'paid') {
    return {
      status: 'paid',
      txHash: str(body, 'txHash', 'payment'),
      forced: body.forced === true,
      payTo: text(body.payTo) ?? '',
      amount: text(body.amount) ?? '',
    }
  }
  if (body.status === 'pending') {
    const message = text(body.message) ?? 'Sent; waiting for the receipt.'
    return { status: 'pending', txHash: str(body, 'txHash', 'payment'), forced: body.forced === true, message }
  }
  if (body.status === 'reverted') {
    const error = obj(body.error)
    const args: Record<string, string> = {}
    for (const [key, value] of Object.entries(obj(error.args))) if (typeof value === 'string') args[key] = value
    return {
      status: 'reverted',
      broadcast: body.broadcast === true,
      txHash: text(body.txHash),
      forced: body.forced === true,
      error: { name: text(error.name) ?? 'Reverted', args, sentence: text(error.sentence) ?? '' },
      explanation: explanation(body.explanation),
    }
  }
  if (body.status === 'held') {
    return { status: 'held', reasons: records(body.reasons).map(reason), explanation: explanation(body.explanation) }
  }
  throw bad('payment result')
}
