const DIGITS = 13

/** The ENS name the company will answer to, filling in digit by digit as the T-number is typed. */
export function EnsPreview({ digits }: { readonly digits: string }) {
  const complete = digits.length === DIGITS
  const rest = '0'.repeat(Math.max(0, DIGITS - digits.length))
  return (
    <div className={complete ? 'ens-preview is-complete' : 'ens-preview'}>
      <span className="ens-preview__label">Your payee name</span>
      <span className="ens-preview__name">
        <span aria-hidden="true">
          t<span className="ens-preview__typed">{digits}</span>
          <span className="ens-preview__rest">{rest}</span>.payee.eth
        </span>
        <span className="sr-only">{complete ? `t${digits}.payee.eth` : 'appears as you type the T-number'}</span>
      </span>
    </div>
  )
}
