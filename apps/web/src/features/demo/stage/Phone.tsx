import { HankoMark } from '../../../ui/brand/HankoMark'
import { APPROVAL } from '../content/urgent'
import './phone.css'

/** A neutral approver's phone: the World ID approval request, a face check, then approved. Not any app's UI. */
export function Phone() {
  return (
    <div className="dphone" data-d="phone" data-enter="">
      <div className="dphone__screen">
        <span className="dphone__island" aria-hidden="true" />
        <section className="dphone__view" data-d="phone-request">
          <p className="dphone__app">World ID · approve</p>
          <p className="dphone__title">Approve a request?</p>
          <div className="dphone__who">
            <HankoMark size={32} />
            <p>
              <b>Meigi AP agent</b>
              <span className="mono">ap.meigi.eth</span>
            </p>
          </div>
          <p className="dphone__code">
            <span>Code</span>
            <b className="dphone__code-value">••••-••••</b>
            <span className="dphone__match">matches</span>
          </p>
          <span className="dphone__btn dphone__btn--ink" data-d="phone-approve">
            Approve
          </span>
          <span className="dphone__btn">Deny</span>
        </section>
        <section className="dphone__view" data-d="phone-face" data-enter="">
          <div className="dphone__face">
            <span className="dphone__ring" data-d="phone-ring" />
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="26" r="11" fill="none" stroke="currentColor" strokeWidth="2.4" />
              <path d="M13 54c3.5-9 10.6-13 19-13s15.5 4 19 13" fill="none" stroke="currentColor" strokeWidth="2.4" />
            </svg>
          </div>
          <p className="dphone__title">Face check</p>
          <p className="dphone__hint">A fresh proof, on this device</p>
        </section>
        <section className="dphone__view" data-d="phone-done" data-enter="">
          <span className="dphone__check" aria-hidden="true">
            ✓
          </span>
          <p className="dphone__title">Approved</p>
          <p className="dphone__hint">{APPROVAL.acr} · single-use</p>
        </section>
      </div>
    </div>
  )
}
