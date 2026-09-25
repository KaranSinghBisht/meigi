import './x402.css'

interface Parsed {
  readonly score: number
  readonly traits: readonly string[]
}

/** The guard's summary reads "toxicScore 87: known_scammer, sanction_address"; anything else is shown as is. */
function parse(summary: string): Parsed | null {
  const match = /^toxicScore\s+(\d+(?:\.\d+)?)(?::\s*(.*))?$/.exec(summary.trim())
  if (!match) return null
  const traits = (match[2] ?? '')
    .split(',')
    .map((trait) => trait.trim())
    .filter(Boolean)
  return { score: Number(match[1]), traits }
}

interface InterceptaScreenProps {
  readonly flagged: boolean
  readonly summary: string
}

/** Intercepta's verdict on the address the agent was asked to pay: the score, the traits, flagged or clean. */
export function InterceptaScreen({ flagged, summary }: InterceptaScreenProps) {
  const parsed = parse(summary)
  return (
    <div className={flagged ? 'screen-card is-flagged' : 'screen-card'}>
      <p className="screen-card__label">Intercepta screen of payTo</p>
      <p className="screen-card__row">
        {parsed ? (
          <span className="screen-card__score">
            {parsed.score}
            <span className="screen-card__max"> / 100 toxic score</span>
          </span>
        ) : null}
        <span className="screen-card__verdict">{flagged ? '✗ Flagged' : '✓ Clean'}</span>
      </p>
      {parsed && parsed.traits.length > 0 ? (
        <ul className="screen-card__traits" aria-label="Risk traits">
          {parsed.traits.map((trait) => (
            <li key={trait}>{trait.replace(/_/g, ' ')}</li>
          ))}
        </ul>
      ) : null}
      {parsed ? null : <p className="screen-card__raw">{summary}</p>}
    </div>
  )
}
