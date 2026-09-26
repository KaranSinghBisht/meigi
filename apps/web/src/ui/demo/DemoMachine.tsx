import type { ReactNode } from 'react'
import { SERVICES, type Service } from '../../lib/api/services'
import { env } from '../../lib/env/env'
import { HankoMark } from '../brand/HankoMark'
import './demo.css'

interface DemoMachineProps {
  readonly service: Service
  /** What this step does, e.g. "Registering a business". */
  readonly what: string
  /** Why it runs only live, e.g. "it signs as the attester". */
  readonly why: string
  readonly children?: ReactNode
}

/** A calm note, not an error: on the product site this step is a replay, and the live service runs at our booth. */
export function DemoMachine({ service, what, why, children }: DemoMachineProps) {
  const info = SERVICES[service]
  return (
    <section className="demo-machine" aria-labelledby={`demo-${service}`}>
      <HankoMark size={44} />
      <div className="demo-machine__body">
        <h2 id={`demo-${service}`} className="demo-machine__title">
          This page replays a real run.
        </h2>
        <p>
          {what} needs the live {info.name}, which runs at our booth because {why}.
        </p>
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
