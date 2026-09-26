export interface PayeeShare {
  readonly legalName: string
  readonly tNumber: string
  readonly ens: string
  /** The company's page in the public registry. */
  readonly url: string
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

function shareText({ legalName, tNumber, ens }: PayeeShare): string {
  return `${legalName} (${tNumber}) is a registered payee on Meigi. Pay it by name: ${ens}`
}

/** The system share sheet where there is one (phones, Safari), otherwise the text and link go to the clipboard. */
export async function sharePayee(payee: PayeeShare): Promise<ShareOutcome> {
  const text = shareText(payee)
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `${payee.legalName} on Meigi`, text, url: payee.url })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // No share target (or it refused): fall back to the clipboard below.
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${payee.url}`)
    return 'copied'
  } catch {
    return 'failed'
  }
}
