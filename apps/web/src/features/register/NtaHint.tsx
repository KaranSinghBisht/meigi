import { Button } from '../../ui/components/Button'
import { Spinner } from '../../ui/components/Spinner'
import { useNtaPreview } from './useNtaPreview'
import './register.css'

interface NtaHintProps {
  readonly tNumber: string
  readonly legalName: string
  readonly onUseName: (name: string) => void
}

/** Shows the public NTA record for the typed T-number, and whether the typed name matches it exactly. */
export function NtaHint({ tNumber, legalName, onUseName }: NtaHintProps) {
  const preview = useNtaPreview(tNumber)
  if (preview.status === 'idle') return null
  if (preview.status === 'loading') {
    return (
      <p className="nta-hint nta-hint--muted">
        <Spinner /> Looking up the NTA record…
      </p>
    )
  }
  if (preview.status === 'offline') {
    return <p className="nta-hint nta-hint--muted">NTA preview unavailable: the verifier isn't reachable.</p>
  }
  if (preview.status === 'error') return <p className="nta-hint nta-hint--muted">{preview.message}</p>
  if (preview.status === 'missing') {
    return <p className="nta-hint nta-hint--warn">No corporation with this number in the NTA data.</p>
  }
  const { record } = preview
  const matches = legalName.trim() === record.name
  return (
    <div className={matches ? 'nta-hint nta-hint--ok' : 'nta-hint'}>
      <p>
        <span className="nta-hint__label">NTA record</span>{' '}
        <span className="jp" lang="ja">
          {record.name}
        </span>
        {record.address ? (
          <span className="nta-hint__address" lang="ja">
            {' '}
            · {record.address}
          </span>
        ) : null}
        {record.closed ? <strong> · closed</strong> : null}
      </p>
      {matches ? (
        <span className="nta-hint__match">✓ exact match</span>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => onUseName(record.name)}>
          Use this exact name
        </Button>
      )}
    </div>
  )
}
