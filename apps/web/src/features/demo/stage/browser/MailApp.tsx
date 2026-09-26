import { BEC } from '../../content/bec'
import { READ_MAIL, type InboxRow } from '../../content/inbox'
import { URGENT } from '../../content/urgent'
import { Compose } from './Compose'
import { BecMessage, UrgentMessage } from './MailMessage'
import './mail.css'

const LABELS = ['Starred', 'Snoozed', 'Sent', 'Drafts'] as const

function Rail() {
  return (
    <nav className="mail__rail" aria-hidden="true">
      <span className="mail__compose">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 13h2.2L12 6.2 9.8 4 3 10.8V13Zm8-10.2 2.2 2.2 1-1a.9.9 0 0 0 0-1.3l-.9-.9a.9.9 0 0 0-1.3 0l-1 1Z" />
        </svg>
        Compose
      </span>
      <span className="mail__label is-current">
        Inbox
        <b className="mail__count" data-d="inbox-count" data-enter="">
          1
        </b>
      </span>
      {LABELS.map((label) => (
        <span key={label} className="mail__label">
          {label}
        </span>
      ))}
      <p className="mail__rail-head">Labels</p>
      <span className="mail__label">
        <i className="mail__dot mail__dot--a" />
        請求書
      </span>
      <span className="mail__label">
        <i className="mail__dot mail__dot--b" />
        経理
      </span>
    </nav>
  )
}

interface RowProps {
  readonly row: InboxRow
  readonly unread?: boolean
  readonly name?: string
  readonly attachment?: string
  readonly paid?: boolean
}

function Row({ row, unread = false, name, attachment, paid = false }: RowProps) {
  return (
    <div className={unread ? 'mrow is-unread' : 'mrow'} data-d={name}>
      <p className="mrow__line">
        <span className="mrow__from">{row.from}</span>
        <span className="mrow__time">{row.time}</span>
      </p>
      <p className="mrow__subject">{row.subject}</p>
      <p className="mrow__snippet">{row.snippet}</p>
      {attachment || paid ? (
        <p className="mrow__chips">
          {attachment ? <span className="mrow__att">{attachment}</span> : null}
          {paid ? (
            <span className="mrow__paid" data-d="row-urgent-paid">
              Paid
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}

const BEC_ROW: InboxRow = {
  id: 'bec',
  from: BEC.mail.fromName,
  subject: BEC.mail.subject,
  snippet: 'いつも大変お世話になっております。株式会社メイギ商事 経理部の佐藤でございます。',
  time: '18:42',
}

const URGENT_ROW: InboxRow = {
  id: 'urgent',
  from: URGENT.mail.fromName,
  subject: URGENT.mail.subject,
  snippet: `請求書番号: ${URGENT.invoice} ご請求金額 ${URGENT.amount}（税込）`,
  time: '9/26',
}

function List() {
  return (
    <div className="mail__list">
      <div className="mail__listbar" aria-hidden="true">
        <span className="mail__check" />
        <span className="mail__listbar-meta">Primary</span>
      </div>
      <div className="mail__rows">
        <div className="mrow-slot" data-d="slot-urgent">
          <Row row={URGENT_ROW} unread name="row-urgent" attachment={URGENT.mail.attachment} paid />
        </div>
        <div className="mrow-slot" data-d="slot-bec">
          <Row row={BEC_ROW} unread name="row-bec" />
        </div>
        {READ_MAIL.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </div>
    </div>
  )
}

function TopBar() {
  return (
    <div className="mail__top" aria-hidden="true">
      <span className="mail__brand">
        <svg viewBox="0 0 24 18" aria-hidden="true">
          <rect x="1" y="1" width="22" height="16" rx="3.5" fill="#5b6bd5" />
          <path d="m3.5 4 8.5 6.2L20.5 4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Mail
      </span>
      <span className="mail__search">Search mail</span>
      <span className="mail__avatar">ハ</span>
    </div>
  )
}

/** A familiar webmail client (ours, no one else's marks): labels, the message list, then the open message. */
export function MailApp() {
  return (
    <div className="mail" data-d="mail">
      <TopBar />
      <div className="mail__main">
        <Rail />
        <List />
        <div className="mail__read">
          <p className="mail__empty" data-d="read-empty">
            No conversation selected
          </p>
          <BecMessage />
          <UrgentMessage />
          <Compose />
        </div>
      </div>
    </div>
  )
}
