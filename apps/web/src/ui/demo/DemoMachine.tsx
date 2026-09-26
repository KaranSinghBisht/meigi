import type { ReactNode } from 'react'
import { SERVICES, type Service } from '../../lib/api/services'
import { env } from '../../lib/env/env'
import { HankoMark } from '../brand/HankoMark'
import './demo.css'

interface DemoMachineProps {
  readonly service: Service
  /** The note's heading. Only a page that shows a recorded run may say "This page replays a real run." */
  readonly title: string
  /** What this step does and why it runs only live, e.g. "Registering a business" and "it signs as the attester". */
  readonly live?: { readonly what: string; readonly why: string }
  readonly children?: ReactNode
}

/** A calm note, not an error: on the product site this step runs only at our booth. */
export function DemoMachine({ service, title, live, children }: DemoMachineProps) {
  const info = SERVICES[service]
  return (
    <section className="demo-machine" aria-labelledby={`demo-${service}`}>
      <HankoMark size={44} />
      <div className="demo-machine__body">
        <h2 id={`demo-${service}`} className="demo-machine__title">
          {title}
        </h2>
        {live ? (
          <p>
            {live.what} needs the live {info.name}, which runs at our booth because {live.why}.
          </p>
        ) : null}
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
