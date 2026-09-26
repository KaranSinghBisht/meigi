/** The onboarding's six screens, as the progress rail names them. */
export const STEPS = [
  'Your company',
  'Your wallets',
  'Prove your domain',
  'Your officers',
  'Review and register',
  "You're verified",
] as const

export const STEP_COUNT = STEPS.length

export type StepIndex = 0 | 1 | 2 | 3 | 4 | 5
