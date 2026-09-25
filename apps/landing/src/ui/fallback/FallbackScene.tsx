import { useMemo } from 'react'
import { VIEW, fujiSilhouette, fujiSnowCap, ridge } from './fallbackPaths'
import './fallback.css'

function Defs() {
  return (
    <defs>
      <linearGradient id="fb-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#B9B4E6" />
        <stop offset="0.45" stopColor="#F2C4D3" />
        <stop offset="1" stopColor="#FFE3C8" />
      </linearGradient>
      <linearGradient id="fb-lake" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F6DCD3" />
        <stop offset="1" stopColor="#B7B0DC" />
      </linearGradient>
      <linearGradient id="fb-fuji" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.25" stopColor="#A7A3D6" />
        <stop offset="0.7" stopColor="#8D8FC4" />
        <stop offset="1" stopColor="#F4D6D2" />
      </linearGradient>
      <radialGradient id="fb-sun" cx="0.08" cy="0.56" r="0.5">
        <stop offset="0" stopColor="#FFF4E6" stopOpacity="0.95" />
        <stop offset="1" stopColor="#FFE3C8" stopOpacity="0" />
      </radialGradient>
      <filter id="fb-ripple" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves="2" seed="5" />
        <feDisplacementMap in="SourceGraphic" scale="18" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  )
}

function Torii() {
  return (
    <g>
      <rect x="352" y="520" width="12" height="130" fill="#E0452B" />
      <rect x="446" y="520" width="12" height="130" fill="#E0452B" />
      <rect x="336" y="548" width="138" height="9" fill="#E0452B" />
      <path d="M326 516 Q 405 526 484 516 L 488 506 Q 405 516 322 506 Z" fill="#E0452B" />
      <path d="M314 502 Q 405 514 496 502 L 502 488 Q 405 502 308 488 Z" fill="#221D24" />
    </g>
  )
}

function Landscape() {
  const paths = useMemo(
    () => ({
      fuji: fujiSilhouette(),
      snow: fujiSnowCap(),
      far: ridge(VIEW.horizon - 4, 26, 160, 5),
      near: ridge(VIEW.horizon + 2, 14, 90, 11),
    }),
    [],
  )
  return (
    <g>
      <path d={paths.fuji} fill="url(#fb-fuji)" />
      <path d={paths.snow} fill="#FBF6F7" />
      <path d={paths.far} fill="#B9AFD6" opacity="0.9" />
      <path d={paths.near} fill="#9C94C4" opacity="0.9" />
    </g>
  )
}

/** Static dawn scene for browsers without WebGL2: same composition, no motion. */
export function FallbackScene() {
  const mirror = `translate(0 ${VIEW.horizon * 2}) scale(1 -1)`
  return (
    <svg
      className="fallback"
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <Defs />
      <rect width={VIEW.width} height={VIEW.horizon} fill="url(#fb-sky)" />
      <rect width={VIEW.width} height={VIEW.height} fill="url(#fb-sun)" />
      <rect y={VIEW.horizon} width={VIEW.width} height={VIEW.height - VIEW.horizon} fill="url(#fb-lake)" />
      <Landscape />
      <g transform={mirror} opacity="0.55" filter="url(#fb-ripple)">
        <Landscape />
      </g>
      <Torii />
      <g transform="translate(0 1300) scale(1 -1)" opacity="0.5" filter="url(#fb-ripple)">
        <Torii />
      </g>
    </svg>
  )
}
