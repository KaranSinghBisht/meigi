import { Link } from 'react-router'
import { LinkButton } from '../../../ui/components/Button'
import { LiveLine } from './LiveLine'
import './story.css'

/** The last beat: one plain statement, the same two ways in as the poster, and the chain's live figures. */
export function ClosingSection() {
  return (
    <section className="closing" aria-labelledby="closing-title">
      <h2 id="closing-title" className="closing__statement">
        <span className="closing__line">An invoice can say anything.</span>
        <span className="closing__line closing__line--accent">The registry says who gets paid.</span>
      </h2>
      <div className="closing__actions">
        <LinkButton to="/demo" variant="primary" size="lg">
          Watch the agent at work
        </LinkButton>
        <Link to="/register" className="closing__link">
          Register a company <span aria-hidden="true">→</span>
        </Link>
      </div>
      <LiveLine />
    </section>
  )
}
