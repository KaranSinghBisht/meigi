import '../../ui/layout/layout.css'
import { CHECKS } from './checks'
import { TryCheck } from './TryCheck'
import './try.css'

/** Try Meigi in three minutes: eight numbered checks in one window, all live but one recorded run. */
export default function TryPage() {
  return (
    <div className="try">
      <header className="page-head">
        <p className="eyebrow">Try it</p>
        <h1 className="page-head__title">Try Meigi in three minutes.</h1>
        <p className="page-head__lede">
          Eight checks, each one a link. The chips read Sepolia as the page opens (one is a recorded run, and says so),
          and nothing here needs a wallet.
        </p>
      </header>
      <ol className="try-list window cells">
        {CHECKS.map((check, index) => (
          <TryCheck key={check.title} step={index + 1} {...check} />
        ))}
      </ol>
    </div>
  )
}
