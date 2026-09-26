import { REPLY_DRAFT } from '../../content/bec'

/** The agent's reply draft, sliding up like a webmail compose window. It waits for a person to send it. */
export function Compose() {
  return (
    <section className="compose" data-d="compose" data-enter="">
      <header className="compose__bar">
        <span>Draft reply · by ap.meigi.eth</span>
        <span className="compose__controls" aria-hidden="true">
          – ⤢ ×
        </span>
      </header>
      <p className="compose__field">
        <span className="compose__key">To</span>
        <span className="compose__value">{REPLY_DRAFT.to}</span>
        <span className="compose__onfile">on file</span>
      </p>
      <p className="compose__field">
        <span className="compose__key">Subject</span>
        <span className="compose__value compose__value--subject">{REPLY_DRAFT.subject}</span>
      </p>
      <div className="compose__body">
        <p className="compose__ja">
          <span className="typed">
            <span className="typed__ghost" aria-hidden="true">
              {REPLY_DRAFT.ja}
            </span>
            <span className="typed__live" data-d="compose-ja" />
          </span>
        </p>
        <p className="compose__en" data-d="compose-en" data-enter="">
          {REPLY_DRAFT.en}
        </p>
      </div>
      <footer className="compose__foot">
        <span className="compose__send">Send</span>
        <span className="compose__review" data-d="compose-review" data-enter="">
          Ready for review
        </span>
      </footer>
    </section>
  )
}
