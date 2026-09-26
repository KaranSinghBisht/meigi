// Each screen's question and one-line lede, shared by the live wizard and the hosted replay so the two never drift.

export const COPY = {
  company: {
    title: 'Which company is joining?',
    lede: 'Enter its T-number, the qualified invoice number, or paste its LEI. Meigi fills in the rest from the National Tax Agency registry.',
  },
  wallets: {
    title: 'Which wallets will it use?',
    lede: 'A business key that requests changes, and the one address every payment goes to.',
  },
  domain: {
    title: 'Which domain does the company use?',
    lede: "The one on its website and email. You'll add one DNS record to prove it's yours.",
  },
  domainFictional: {
    title: 'No domain to prove',
    lede: 'A fictional company has no real domain, so Meigi skips this step and records it as fictional.',
  },
  representative: {
    title: 'Prove you represent the company',
    lede: "Controlling a domain doesn't make someone the company. Its registered representative will sign for it.",
  },
  officers: {
    title: 'Who approves changes?',
    lede: 'Any payout change the company asks for needs these same people.',
  },
  review: {
    title: 'Check everything, then register',
    lede: "Meigi's attester writes this registration to the public registry on Sepolia. A number that's already claimed is frozen as disputed, never overwritten.",
  },
  // A payout changes two ways, both behind the registry's 72-hour public window (PayeeRegistry.changeDelay):
  // requestPayoutChange (business key + officers), or governance's resolveDispute then finalizeDispute.
  registered: {
    title: "You're registered.",
    lede: (ens: string) =>
      `Payers who check ${ens} will only ever pay the address below. It changes only through a 72-hour public window: your business key with your officers, or a governance ruling on a dispute.`,
  },
  /** The replay's last screen speaks about the company, not to it: the viewer registered nothing. */
  registeredReplay: {
    title: "It's registered.",
    lede: (ens: string) =>
      `Payers who check ${ens} will only ever pay the address below. It changes only through a 72-hour public window: the company's business key with its officers, or a governance ruling on a dispute.`,
    placeholderLede: (ens: string) =>
      `Payers who check ${ens} pay only the address below. With a placeholder officer the company can't change it; only a governance ruling on a dispute can, after a 72-hour public window.`,
  },
} as const
