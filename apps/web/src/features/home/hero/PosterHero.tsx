import { Link } from 'react-router'
import { HankoMark } from '../../../ui/brand/HankoMark'
import { LinkButton } from '../../../ui/components/Button'
import { usePosterFont } from './usePosterFont'
import './poster.css'

/**
 * The first screen under the navigation, set like a Japanese poster over the live world: one line in heavy
 * Japanese across the whole width, the same line in English beneath it, the 名義 seal pressed at the end, and two
 * ways in. The Japanese breaks only between phrases (アドレス / ではなく、 / 会社に / 支払う。): two lines on wide
 * screens, four on a phone.
 */
export function PosterHero() {
  usePosterFont()
  return (
    <section className="poster" aria-labelledby="poster-title">
      <h1 id="poster-title" className="poster__title">
        <span className="poster__jp" lang="ja">
          <span className="poster__line">
            <span className="poster__phrase">アドレス</span>
            <span className="poster__phrase">ではなく、</span>
          </span>
          <span className="poster__line">
            <span className="poster__phrase">会社に</span>
            <span className="poster__phrase">
              支払う。
              <HankoMark className="poster__seal" size={96} />
            </span>
          </span>
        </span>
        <span className="poster__en">Pay companies, not addresses.</span>
      </h1>
      <div className="poster__actions">
        <LinkButton to="/demo" variant="primary" size="lg">
          Watch the agent at work
        </LinkButton>
        <Link to="/register" className="poster__link">
          Register a company <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  )
}
