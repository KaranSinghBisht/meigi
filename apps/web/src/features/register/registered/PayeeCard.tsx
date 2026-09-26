import type { HexAddress } from '../../../lib/env/env'
import { HankoMark } from '../../../ui/brand/HankoMark'
import { Address } from '../../../ui/components/Address'
import { Spinner } from '../../../ui/components/Spinner'
import { useQr } from '../../../ui/world/useQr'

interface PayeeCardProps {
  readonly legalName: string
  readonly tNumber: string
  readonly ens: string
  readonly payout: HexAddress
  readonly fixture: boolean
}

function EnsQr({ ens }: { readonly ens: string }) {
  const qr = useQr(ens)
  return (
    <figure className="payee-card__qr">
      <div className="payee-card__qr-img">
        {qr.src ? <img src={qr.src} alt={`QR code of ${ens}`} width={132} height={132} /> : null}
        {!qr.src && !qr.failed ? <Spinner /> : null}
        {qr.failed ? <span className="payee-card__qr-failed">No QR</span> : null}
      </div>
      <figcaption>Scan to pay by name</figcaption>
    </figure>
  )
}

/** The company as a payer's wallet will see it: the one colour card on this page, lavender with ink text. */
export function PayeeCard({ legalName, tNumber, ens, payout, fixture }: PayeeCardProps) {
  return (
    <article className="payee-card" aria-label={`Payee card for ${legalName}`}>
      <div className="payee-card__main">
        <p className="payee-card__brand">
          <HankoMark size={28} />
          <span>{fixture ? 'Registered payee · fictional company' : 'Registered payee'}</span>
        </p>
        <p className="payee-card__name jp" lang="ja">
          {legalName}
        </p>
        <dl className="payee-card__facts">
          <div>
            <dt>T-number</dt>
            <dd className="mono">{tNumber}</dd>
          </div>
          <div>
            <dt>ENS name</dt>
            <dd className="mono">{ens}</dd>
          </div>
          <div>
            <dt>Pays only to</dt>
            <dd>
              <Address value={payout} />
            </dd>
          </div>
        </dl>
      </div>
      <EnsQr ens={ens} />
    </article>
  )
}
