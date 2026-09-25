import type { ReactNode } from 'react'
import { SERVICES, type Service } from '../../lib/api/services'
import { env } from '../../lib/env/env'
import { HankoMark } from '../brand/HankoMark'
import './demo.css'

interface DemoMachineProps {
  readonly service: Service
  /** What this step does, e.g. "Registering a business". */
  readonly what: string
  /** Why it can't run here, e.g. "it signs as the attester". */
  readonly why: string
  readonly children?: ReactNode
}

/** A calm explanation, not an error: this step needs a service that only runs on the demo laptop. */
export function DemoMachine({ service, what, why, children }: DemoMachineProps) {
  const info = SERVICES[service]
  return (
    <section className="demo-machine" aria-labelledby={`demo-${service}`}>
      <HankoMark size={44} />
      <div className="demo-machine__body">
        <h2 id={`demo-${service}`} className="demo-machine__title">
          This step runs on the Meigi demo machine.
        </h2>
        <p>
          {what} needs the {info.name}, which only runs on our demo laptop because {why}. Watch it in the demo video, or
          run it locally:
        </p>
        <code className="demo-machine__cmd">{info.start}</code>
        {env.demoVideoUrl ? (
          <a className="demo-machine__video" href={env.demoVideoUrl} target="_blank" rel="noreferrer">
            Watch the demo video <span aria-hidden="true">↗</span>
          </a>
        ) : null}
        {children}
      </div>
    </section>
  )
}
