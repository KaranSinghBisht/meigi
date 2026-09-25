// Client for the AP agent (services/agent): analyse a document, pay it (or force it, to show the chain's
// answer), the demo documents, and the vault's state.

import { env } from '../env/env'
import { authHeaders } from './agentAuth'
import { parseAnalysis, parsePayOutcome } from './agentParse'
import type { Analysis, DemoInvoice, PayOutcome } from './agentTypes'
import { joinUrl, requestJson } from './http'
import { isRecord, record } from './parse'

const url = (path: string) => joinUrl(env.agentUrl, path)

export async function analyzeInvoice(text: string, signal?: AbortSignal): Promise<Analysis> {
  const body = await requestJson(url('/invoices/analyze'), {
    method: 'POST',
    body: { text },
    headers: authHeaders(),
    timeoutMs: 120_000,
    signal,
  })
  return parseAnalysis(record(body, 'analysis'))
}

export async function payInvoice(id: string, force: boolean): Promise<PayOutcome> {
  const body = await requestJson(url(`/invoices/${encodeURIComponent(id)}/pay`), {
    method: 'POST',
    body: { force },
    headers: authHeaders(),
    timeoutMs: 180_000,
  })
  return parsePayOutcome(record(body, 'payment result'))
}

export async function fetchDemoInvoices(): Promise<DemoInvoice[]> {
  const body = record(await requestJson(url('/demo/invoices'), { timeoutMs: 8_000 }), 'demo invoices')
  const list = Array.isArray(body.invoices) ? body.invoices.filter(isRecord) : []
  return list.flatMap((item) => {
    const note = isRecord(item.expect) && typeof item.expect.note === 'string' ? item.expect.note : null
    if (typeof item.title !== 'string' || typeof item.text !== 'string') return []
    const id = typeof item.file === 'string' ? item.file : item.title
    return [{ id, title: item.title, text: item.text, note }]
  })
}
