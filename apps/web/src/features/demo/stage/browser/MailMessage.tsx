import { BEC } from '../../content/bec'
import { URGENT } from '../../content/urgent'
import { Marked } from '../Marked'
import './message.css'

const JST = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function mailDate(header: string): string {
  const date = new Date(header)
  return Number.isNaN(date.getTime()) ? header : JST.format(date)
}

interface HeadProps {
  readonly subject: string
  readonly fromName: string
  readonly fromAddress: string
  readonly date: string
  /** Names the sender's address for the timeline (the cursor lingers on the look-alike domain). */
  readonly senderName: string
  readonly paidName?: string
}

function MessageHead({ subject, fromName, fromAddress, date, senderName, paidName }: HeadProps) {
  return (
    <>
      <h3 className="msg__subject">
        {subject}
        <span className="msg__tag">Inbox</span>
        {paidName ? (
          <span className="msg__paid" data-d={paidName} data-enter="">
            Paid
          </span>
        ) : null}
      </h3>
      <div className="msg__from">
        <span className="msg__avatar" aria-hidden="true">
          メ
        </span>
        <p className="msg__who">
          <b>{fromName}</b>{' '}
          <span className="msg__addr" data-d={senderName}>
            &lt;{fromAddress}&gt;
          </span>
          <span className="msg__to">to me</span>
        </p>
        <time className="msg__date">{date}</time>
      </div>
    </>
  )
}

/** The recorded bank-change email, exactly as the agent read it. */
export function BecMessage() {
  const { mail } = BEC
  return (
    <article className="msg" data-d="msg-bec" data-enter="">
      <MessageHead
        subject={mail.subject}
        fromName={mail.fromName}
        fromAddress={mail.fromAddress}
        date={mailDate(mail.date)}
        senderName="bec-sender"
      />
      <div className="msg__scroll" data-d="bec-scroll">
        <div className="msg__text">
          <span className="msg__scan" data-d="bec-scan" aria-hidden="true" />
          <Marked segments={BEC.body} prefix="bec" />
        </div>
      </div>
    </article>
  )
}

/** The urgent invoice: a genuine supplier, the registered payout, and 至急. Its PDF is shown inline. */
export function UrgentMessage() {
  const { mail } = URGENT
  return (
    <article className="msg" data-d="msg-urgent" data-enter="">
      <MessageHead
        subject={mail.subject}
        fromName={mail.fromName}
        fromAddress={mail.fromAddress}
        date={mailDate(URGENT.recordedAt.toUTCString())}
        senderName="urgent-sender"
        paidName="msg-urgent-paid"
      />
      <p className="msg__attachment">
        <span className="msg__pdf">PDF</span>
        {mail.attachment}
      </p>
      <div className="msg__scroll msg__scroll--paper" data-d="urgent-scroll">
        <div className="msg__paper">
          <Marked segments={URGENT.document} prefix="urgent" />
        </div>
      </div>
    </article>
  )
}
