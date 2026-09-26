// Chapter 0: a company joins Meigi, shown as /register's own replay shows it. Everything here is derived from
// RECORDING (content/onboardRecording), and the copy is /register's, verbatim (register/flow/copy.ts, the step
// components and replay/ReplayScreens.tsx), so the replica and the site never drift.

import { shortAddress, shortHash } from '../../../lib/chain/format'
import { RECORDING, type PayoutMode } from './onboardRecording'

const REGISTRY = '0x205c977cF1f4Ed42e51a48759550eF40160A6396'
const APP_HOST = 'meigi.karanbishttt.workers.dev'

const rec = RECORDING
const ens = `${rec.company.tNumber.toLowerCase()}.payee.eth`
const placeholder = rec.officers.some((officer) => officer.proof === 'placeholder')

export const ONBOARD = {
  /** `seed`: registered by the seed script, shown without clicks. `wizard`: a real run, shown click by click. */
  seeded: rec.source === 'seed',
  tNumber: rec.company.tNumber,
  query: rec.company.query,
  legalName: rec.company.legalName,
  fixture: rec.company.fixture,
  note: rec.company.note,
  address: rec.company.address,
  ens,
  registry: REGISTRY,
  registryShort: shortAddress(REGISTRY),
  controllerShort: shortAddress(rec.controller),
  payoutShort: shortAddress(rec.payout.address),
  payoutMode: rec.payout.mode ?? null,
  domain: rec.domain,
  officers: rec.officers.map((officer) => ({
    short: shortHash(officer.id),
    proof: officer.proof,
    sybilScore: officer.sybilScore ?? null,
  })),
  placeholder,
  threshold: rec.threshold,
  evidenceShort: shortHash(rec.evidence),
  txShort: shortHash(rec.txHash),
  block: rec.block,
  at: new Date(rec.at),
  /** The public payee page the registered payee card's QR code opens. */
  payeeUrl: `https://${APP_HOST}/registry/${rec.company.tNumber}`,
  appHost: APP_HOST,
} as const

/** The wizard's seven screens, as the real progress rail names them (register/flow/steps.ts). */
export const ONBOARD_STEPS = [
  'Your company',
  'Your wallets',
  'Prove your domain',
  'Prove representation',
  'Your officers',
  'Review and register',
  'Registered',
] as const

/**
 * Steps passed but not done, which the rail marks "–" as /register does (1-based): representation always (not built
 * for anyone yet), a demo company's domain, and placeholder officers.
 */
export const ONBOARD_SKIPPED: readonly number[] = [
  ...(rec.domain.method === 'fixture' ? [3] : []),
  4,
  ...(placeholder ? [5] : []),
]

const PROVEN_BY: Record<string, string> = { dns: 'a signed DNS TXT record', 'well-known': 'a signed file at /.well-known/meigi.json' }

/** Each screen's question and lede, and the lines around them, verbatim from /register. */
export const ONBOARD_COPY = {
  /** The replay's one honest line (RegisterReplay.tsx, BarNote). */
  bar: rec.source === 'wizard'
    ? { strong: 'Replay of a real registration on Sepolia', rest: 'registering your own company opens with the beta' }
    : {
        strong: 'How the wizard presents a registration',
        rest: `${rec.company.legalName} is a demo company our seed script registered on Sepolia`,
      },
  company: {
    title: 'Which company is joining?',
    lede: 'Enter its T-number, the qualified invoice number, or paste its LEI. Meigi fills in the rest from the National Tax Agency registry.',
  },
  wallets: {
    title: 'Which wallets will it use?',
    lede: 'A business key that approves changes, and the one address every payment goes to.',
    keyLede: 'It signs the domain proof, and every change after registration.',
    payoutLede: 'The only address payers who check Meigi will send money to.',
  },
  domain: domainCopy(),
  representative: {
    title: 'Prove you represent the company',
    lede: "Controlling a domain doesn't make someone the company. Its registered representative will sign for it.",
  },
  /** Step 4's note: a demo company proves none of what a real registration does (RepresentativeStep.tsx). */
  representativeNote: rec.company.fixture
    ? {
        title: 'A demo company is fictional: it has no NTA record and no domain to prove.',
        detail:
          "A real company's registration proves an exact NTA name match, domain control and World ID officers today. In production it also proves the signer represents the company.",
      }
    : {
        title: 'Today, registration proves an exact NTA name match, domain control and World ID officers.',
        detail: 'In production it also proves the signer represents the company.',
      },
  officers: {
    title: 'Who approves changes?',
    lede: placeholder
      ? 'Real companies enroll officers with World ID. This demo company has a placeholder officer no one can prove, so no one can change its payout.'
      : 'Every future payout change needs one of these same people.',
  },
  review: {
    title: 'Check everything, then register',
    lede: "Meigi's attester writes this registration to the public registry on Sepolia. A number that's already claimed is frozen as disputed, never overwritten.",
  },
  /** The replay speaks about the company, not to it (COPY.registeredReplay). */
  registered: {
    title: "It's registered.",
    lede: placeholder
      ? `Payers who check ${ens} pay only the address below. Its placeholder officer means no one can change it; a real company changes it with its business key, its officers and 72 hours in public.`
      : `Payers who check ${ens} will only ever pay the address below. Changing it takes the company's business key, its officers and 72 hours in public.`,
  },
} as const

function domainCopy(): { readonly title: string; readonly lede: string; readonly notice: string | null } {
  if (rec.source === 'seed') {
    return {
      title: 'No domain to prove',
      lede: 'Our seed script registered this demo company without a domain proof: nothing was signed and no DNS record was added.',
      notice: null,
    }
  }
  if (rec.domain.method === 'fixture') {
    return {
      title: 'No domain to prove',
      lede: 'A fictional company has no real domain, so Meigi skips this step and records it as fictional.',
      notice: `${rec.company.note ? `${rec.company.note} ` : ''}There's nothing to sign and no DNS record to add.`,
    }
  }
  const how = PROVEN_BY[rec.domain.method] ?? 'a signed record'
  return {
    title: 'Your domain is proven',
    lede: `${rec.domain.name ?? 'The domain'} is proven.`,
    notice: `The business key signed the challenge, published as ${how}.`,
  }
}

/** The payout choice as the wizard names it (wallets/PayoutChoice.tsx). */
export const PAYOUT_CHOICE: Readonly<Record<PayoutMode, string>> = {
  create: 'Create a new wallet',
  connected: 'Use my business wallet',
  paste: 'Paste an address',
}

/** The review's officers line (ReplayScreens.tsx, officersText). */
export function officersText(): string {
  const n = rec.officers.length
  return placeholder ? `${n} placeholder ${n === 1 ? 'officer' : 'officers'}` : `${n} verified ${n === 1 ? 'human' : 'humans'}`
}

/** How a registrant will prove they act for the company: not built for anyone yet, so both are shown disabled. */
export const REPRESENTATION_METHODS = [
  {
    id: 'certificate',
    title: 'Sign with 商業登記電子証明書',
    body: "The Legal Affairs Bureau's corporate e-certificate for the registered representative, signed remotely through gBizID.",
  },
  {
    id: 'mail',
    title: 'Mail a code to the registered head office',
    body: 'A one-time code by registered mail to the head office the NTA lists, entered here on arrival.',
  },
] as const
