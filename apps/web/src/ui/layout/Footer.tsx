import { Link } from 'react-router'
import { configIssues, env } from '../../lib/env/env'
import { Address } from '../components/Address'
import './layout.css'

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <p className="footer__line">
          <span>Sepolia</span>
          <span aria-hidden="true">·</span>
          <span>
            Registry <Address value={env.registry} short />
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Vault <Address value={env.vault} short />
          </span>
        </p>
        <p className="footer__line footer__line--quiet">
          <span className="jp">名義</span> Pay companies, not addresses. ETHGlobal Tokyo 2026 · From Scratch ·{' '}
          <Link to="/" className="footer__lake">
            Back to the lake
          </Link>
        </p>
        {configIssues.length > 0 ? (
          <ul className="footer__issues" aria-label="Configuration problems">
            {configIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </footer>
  )
}
