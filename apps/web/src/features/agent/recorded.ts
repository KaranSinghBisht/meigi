// A real run of the AP agent against Sepolia (bank-change email, then "Let the agent pay anyway"), kept as
// the agent returned it and replayed on the hosted site. It goes through the same parser as live answers.

import { parseAnalysis, parsePayOutcome } from '../../lib/api/agentParse'
import type { Analysis, PayOutcome } from '../../lib/api/agentTypes'
import analysisJson from './recorded/bec-analysis.json'
import emailText from './recorded/bec-document.txt?raw'
import payJson from './recorded/bec-pay.json'

type Reverted = Extract<PayOutcome, { status: 'reverted' }>

export interface RecordedAgentRun {
  readonly recordedAt: Date
  readonly document: string
  readonly analysis: Analysis
  readonly outcome: Reverted
}

function reverted(outcome: PayOutcome): Reverted {
  if (outcome.status !== 'reverted') throw new Error('the recorded agent run must end in a revert')
  return outcome
}

export const RECORDED_BEC: RecordedAgentRun = {
  recordedAt: new Date(analysisJson.createdAt),
  document: emailText,
  analysis: parseAnalysis(analysisJson),
  outcome: reverted(parsePayOutcome(payJson)),
}
