import type { ReactNode } from 'react'
import type { Explained } from '../../lib/api/messages'
import './feedback.css'

export type NoticeTone = 'info' | 'success' | 'warn' | 'danger' | 'denied' | 'offline'

interface NoticeProps {
  readonly tone?: NoticeTone
  readonly title: ReactNode
  readonly children?: ReactNode
  readonly action?: ReactNode
}

/** Inline status message. Errors and denials are announced (role="alert"), everything else politely. */
export function Notice({ tone = 'info', title, children, action }: NoticeProps) {
  const urgent = tone === 'danger' || tone === 'denied'
  return (
    <div className={`notice notice--${tone}`} role={urgent ? 'alert' : 'status'}>
      <div className="notice__body">
        <p className="notice__title">{title}</p>
        {children ? <div className="notice__detail">{children}</div> : null}
      </div>
      {action ? <div className="notice__action">{action}</div> : null}
    </div>
  )
}

const TONES: Record<Explained['tone'], NoticeTone> = { denied: 'denied', offline: 'offline', error: 'danger' }

/** Renders an explained error (see lib/api/messages). Inline code in `detail` is shown as code. */
export function ErrorNotice({ error, action }: { readonly error: Explained; readonly action?: ReactNode }) {
  const parts = error.detail?.split('`') ?? []
  return (
    <Notice tone={TONES[error.tone]} title={error.title} action={action}>
      {parts.length ? (
        <p>{parts.map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part))}</p>
      ) : null}
    </Notice>
  )
}
