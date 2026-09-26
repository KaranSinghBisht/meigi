import { MAILBOX } from '../../content/inbox'
import { MailApp } from './MailApp'
import { TerminalPage } from './TerminalPage'
import './browser.css'

function TrafficLights() {
  return (
    <span className="mac__lights" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

function Tabs() {
  return (
    <div className="mac__tabs">
      <div className="mac__tab mac__tab--mail" data-d="tab-mail">
        <span className="mac__tab-icon mac__tab-icon--mail" aria-hidden="true" />
        <span className="mac__tab-title">{MAILBOX.tab}</span>
      </div>
      <div className="mac__tab mac__tab--agent" data-d="tab-agent" data-enter="">
        <span className="mac__tab-icon mac__tab-icon--term" aria-hidden="true">
          ›_
        </span>
        <span className="mac__tab-title">research-agent · x402</span>
      </div>
    </div>
  )
}

function Toolbar() {
  return (
    <div className="mac__toolbar">
      <span className="mac__nav" aria-hidden="true">
        ‹ ›
      </span>
      <div className="mac__url">
        <svg className="mac__lock" viewBox="0 0 12 14" aria-hidden="true">
          <path d="M3 6V4.5a3 3 0 0 1 6 0V6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <rect x="1.5" y="6" width="9" height="7" rx="1.6" fill="currentColor" />
        </svg>
        <span className="mac__url-text" data-d="url-mail">
          {MAILBOX.host}
        </span>
        <span className="mac__url-text mac__url-text--agent" data-d="url-agent" data-enter="">
          localhost:8790/research-agent
        </span>
      </div>
    </div>
  )
}

/** A macOS browser window: a prop inside the scene, so it may look like the real thing. */
export function BrowserWindow() {
  return (
    <section className="mac" data-d="browser">
      <header className="mac__bar">
        <TrafficLights />
        <Tabs />
      </header>
      <Toolbar />
      <div className="mac__page">
        <MailApp />
        <TerminalPage />
      </div>
      <div className="mac__dim" data-d="browser-dim" />
    </section>
  )
}
