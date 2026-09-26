/** The onboarding's screens, as the progress rail names them. */
export const STEPS = [
  'Your company',
  'Your wallets',
  'Prove your domain',
  'Prove representation',
  'Your officers',
  'Review and register',
  'Registered',
] as const

export const STEP_COUNT = STEPS.length

/** Each step by name, so no screen hard-codes where it sits in the rail. */
export const STEP = {
  company: 0,
  wallets: 1,
  domain: 2,
  representative: 3,
  officers: 4,
  review: 5,
  registered: 6,
} as const

export type StepIndex = (typeof STEP)[keyof typeof STEP]

interface Skips {
  /** A demo company: no domain to prove. */
  readonly fixture: boolean
  /** Officers that aren't World ID sessions (a seeded demo company's placeholder). */
  readonly placeholderOfficers?: boolean
}

/** Steps passed without being done: representation isn't built yet, and a demo company has no domain to prove. */
export function skippedSteps({ fixture, placeholderOfficers = false }: Skips): number[] {
  const skipped: number[] = [STEP.representative]
  if (fixture) skipped.push(STEP.domain)
  if (placeholderOfficers) skipped.push(STEP.officers)
  return skipped
}
