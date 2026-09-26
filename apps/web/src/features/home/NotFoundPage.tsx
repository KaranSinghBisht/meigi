import { isRouteErrorResponse, useRouteError } from 'react-router'
import { LinkButton } from '../../ui/components/Button'
import { FujiBackdrop } from '../../ui/brand/FujiBackdrop'
import '../../ui/layout/layout.css'
import './notFound.css'

export function NotFoundPage() {
  return (
    <div className="lost">
      <p className="eyebrow">404</p>
      <h1 className="page-head__title">No page here.</h1>
      <p className="page-head__lede">The mountain hasn't moved, but this address doesn't lead anywhere.</p>
      <LinkButton to="/start" variant="primary">
        Back to Meigi
      </LinkButton>
    </div>
  )
}

/** Rendered by the router when a page throws while rendering. Shows no internals. */
export function RouteErrorPage() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  return (
    <div className="lost lost--standalone">
      <FujiBackdrop />
      <p className="eyebrow">{notFound ? '404' : 'Something broke'}</p>
      <h1 className="page-head__title">{notFound ? 'No page here.' : 'This page hit an error.'}</h1>
      <p className="page-head__lede">
        {notFound ? "This address doesn't lead anywhere." : 'Reload to try again. Nothing was signed or sent.'}
      </p>
      <a className="btn btn--primary btn--md" href="/start">
        Back to Meigi
      </a>
    </div>
  )
}
