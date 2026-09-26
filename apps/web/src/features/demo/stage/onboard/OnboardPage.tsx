import { HankoMark } from '../../../../ui/brand/HankoMark'
import { ONBOARD_SKIPPED, ONBOARD_STEPS } from '../../content/onboard'
import {
  CompanyScreen,
  DomainScreen,
  OfficersScreen,
  RegisteredScreen,
  ReviewScreen,
  WalletsScreen,
} from './OnboardScreens'
import './onboard.css'

function Rail() {
  return (
    <aside className="onb__rail">
      <p className="onb__eyebrow">Company onboarding</p>
      <p className="onb__rail-title">Join the Meigi registry</p>
      <ol className="onb__steps">
        {ONBOARD_STEPS.map((label, index) => {
          const skipped = ONBOARD_SKIPPED.includes(index + 1)
          return (
            <li
              key={label}
              className="onb__step"
              data-d={`onb-step-${index + 1}`}
              data-skip={skipped ? '' : undefined}
            >
              <span className="onb__num" aria-hidden="true">
                <span className="onb__num-n">{index + 1}</span>
                <span className="onb__num-done">{skipped ? '–' : '✓'}</span>
              </span>
              {label}
            </li>
          )
        })}
      </ol>
    </aside>
  )
}

/** Chapter 0's page in the browser: Meigi's own /register, where a company binds its T-number to one payout. */
export function OnboardPage() {
  return (
    <div className="onb" data-d="onboard-page">
      <header className="onb__top">
        <HankoMark size={24} />
        <span className="onb__brand">meigi.</span>
        <span className="onb__crumb">Register a business</span>
      </header>
      <section className="onb__window">
        <Rail />
        <div className="onb__body">
          <CompanyScreen />
          <WalletsScreen />
          <DomainScreen />
          <OfficersScreen />
          <ReviewScreen />
          <RegisteredScreen />
        </div>
      </section>
    </div>
  )
}
