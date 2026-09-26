// Everything on /business is static copy. Facts only as given; prices are deliberately absent (tiers are
// illustrative), and no statistic here is ours to invent.

export interface Product {
  readonly kanji: string
  readonly name: string
  readonly body: string
  /** How it is paid for. */
  readonly model: string
  /** Where to see it working in this app, if anywhere. */
  readonly demo?: { readonly to: string; readonly label: string }
}

export const PRODUCTS: readonly Product[] = [
  {
    kanji: '台帳',
    name: 'Meigi Registry',
    body: 'Register once: an exact-name NTA match, a domain proof and World ID officers. Wallets and agents that check Meigi then pay only the registered address. Resolves in ENS.',
    model: 'Free for companies',
    demo: { to: '/register', label: 'Register a business' },
  },
  {
    kanji: '照合',
    name: 'Verify API',
    body: 'Confirmation of Payee for payers: exchanges, wallets, stablecoin issuers, AP platforms and x402 facilitators.',
    model: 'Subscription + per lookup',
    demo: { to: '/registry', label: 'Look up a payee' },
  },
  {
    kanji: '守護',
    name: 'Guard SDK',
    body: 'The x402 guard and AgentVault for AI-agent platforms. The agent can be talked into anything, but it can only pay a registered payout.',
    model: 'Subscription',
    demo: { to: '/x402', label: 'See the x402 guard' },
  },
  {
    kanji: '支払',
    name: 'Meigi AP Agent',
    body: 'For SMEs paying invoices in stablecoins: triage, a verified human for doubtful payments, and on-chain enforcement.',
    model: 'Per company + per invoice',
    demo: { to: '/agent', label: 'Try the agent console' },
  },
  {
    kanji: '学習',
    name: 'Custom triage models',
    body: 'We fine-tune a small model on your own AP history, and it runs on your hardware. For example, our 0.8B beat a 70B LLM on payment-fraud triage at 39 ms, trained in 39 minutes on a MacBook.',
    model: 'Setup + annual license',
  },
]

export interface Tier {
  readonly name: string
  readonly who: string
  readonly items: readonly string[]
}

export const TIERS: readonly Tier[] = [
  {
    name: 'Free',
    who: 'For companies getting paid',
    items: ['Meigi Registry listing', 'Resolution in ENS', 'Public lookups in the registry explorer'],
  },
  {
    name: 'Pro',
    who: 'For payers and agent platforms',
    items: [
      'Verify API: subscription plus per lookup',
      'Guard SDK: subscription',
      'Meigi AP Agent: per company plus per invoice',
    ],
  },
  {
    name: 'Enterprise',
    who: 'For AP teams with their own history',
    items: [
      'A custom triage model trained on your AP history',
      'Runs on your hardware',
      'Setup plus an annual license',
    ],
  },
]

export interface Milestone {
  readonly id: string
  readonly name: string
  readonly detail: string
  readonly status: 'now' | 'in progress' | 'next'
}

export const ROADMAP: readonly Milestone[] = [
  {
    id: 'jp',
    name: 'Japan first',
    detail: 'T-numbers of qualified-invoice issuers, matched to the NTA registry',
    status: 'now',
  },
  { id: 'lei', name: 'LEI', detail: 'The global Legal Entity Identifier; lookup live', status: 'in progress' },
  { id: 'eu', name: 'EU VAT', detail: 'VIES', status: 'next' },
  { id: 'uk', name: 'UK', detail: 'Companies House', status: 'next' },
  { id: 'in', name: 'India', detail: 'GSTIN', status: 'next' },
]

export const WHY_NOW = [
  {
    title: 'Stablecoins are paying businesses',
    body: 'Stablecoin B2B payments are arriving, and JPYC is licensed in Japan.',
  },
  { title: 'Agents pay for themselves', body: 'AI agents already pay for APIs and data on their own, over x402.' },
  {
    title: 'Payee checks are becoming law',
    body: 'Verification of Payee has been mandatory in the EU since October 2025.',
  },
] as const

export const LEI_NOTE =
  "LEI lookup live: our verifier checks any company's LEI against GLEIF, and links Japanese ones to a T-number by exact NTA name (Sony Group → T5010401067252)."

export const LEI_EXAMPLES = [
  { label: 'Sony Group', lei: '529900R5WX9N2OI2N910' },
  { label: 'Toyota Motor Asia (Singapore)', lei: '2549007SWUPLDICDFN48' },
] as const
