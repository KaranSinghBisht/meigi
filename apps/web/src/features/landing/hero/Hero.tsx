import type { MouseEvent, PointerEvent } from 'react'
import { ArrowDownRight } from '../pills/icons'
import './hero.css'

interface HeroProps {
  readonly appUrl: string
  readonly onEnter: (event: MouseEvent<HTMLAnchorElement>) => void
  readonly onStamp: (x: number, y: number) => void
}

export function Hero({ appUrl, onEnter, onStamp }: HeroProps) {
  const stamp = (event: PointerEvent<HTMLHeadingElement>) => {
    if (event.button === 0) onStamp(event.clientX, event.clientY)
  }

  return (
    <div className="hero">
      <div className="hero__top">
        <p className="hero__byline">
          <span className="hero__event">ETHGlobal Tokyo 2026</span>
        </p>
        <h1 className="hero__wordmark" data-cursor="press" onPointerDown={stamp}>
          meigi.
        </h1>
      </div>
      <div className="hero__bottom">
        <p className="hero__subtitle">Pay companies, not addresses.</p>
        <a className="pill pill--enter lg-lens" href={appUrl} onClick={onEnter}>
          enter
          <ArrowDownRight />
        </a>
      </div>
    </div>
  )
}
