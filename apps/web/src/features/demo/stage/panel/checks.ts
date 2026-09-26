// Short labels for the kernel's checks, keyed by the codes the agent sends. Unknown codes show their code.

const LABELS: Readonly<Record<string, string>> = {
  mandate_live: 'ENS mandate answers',
  vendor_approved: 'Approved vendor',
  payee_registered: 'Registered and active',
  payout_mismatch: 'Registered payout',
  payout_matches: 'Registered payout',
  within_payment_cap: 'Within per-payment cap',
  within_period_cap: 'Within period cap',
  not_paid_before: 'Not paid before',
  vault_funded: 'Vault funded',
  name_matches: 'Issued in the registered name',
}

export function checkLabel(code: string): string {
  return LABELS[code] ?? code.replaceAll('_', ' ')
}

const LAYERS: Readonly<Record<string, string>> = {
  kernel: 'Kernel',
  triage: 'Triage',
  extraction: 'Read',
  screening: 'Screening',
}

export function layerLabel(layer: string): string {
  return LAYERS[layer] ?? layer
}

export const percent = (value: number): string => `${Math.round(value * 100)}%`

/** The model's short name, without a provider path: "@cf/org/some-model" → "some-model"; "gemma4:e4b" stays. */
export const modelName = (model: string | null): string => (model ? (model.split('/').pop() ?? model) : 'model')
