import { VIEW, mountainPath, shorePath, snowPath } from './fujiPaths'
import './brand.css'

const MOUNTAIN = mountainPath()
const SNOW = snowPath()
const SHORE = shorePath()

function Landscape() {
  return (
    <g>
      <path d={MOUNTAIN} fill="url(#fuji-body)" />
      <path d={SNOW} fill="#fffafc" opacity="0.85" />
      <path d={SHORE} fill="#cfc6e6" opacity="0.8" />
    </g>
  )
}

/** A still, faint Sakasa Fuji (mountain and reflection) behind every page. Decorative only. */
export function FujiBackdrop() {
  const mirror = `translate(0 ${VIEW.horizon * 2}) scale(1 -1)`
  return (
    <svg
      className="fuji-backdrop"
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="fuji-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.2" stopColor="#b9b3e3" />
          <stop offset="0.75" stopColor="#cdc5ea" />
          <stop offset="1" stopColor="#f1dfe9" />
        </linearGradient>
        <linearGradient id="fuji-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="fuji-reflection-mask">
          <rect y={VIEW.horizon} width={VIEW.width} height={VIEW.height - VIEW.horizon} fill="url(#fuji-fade)" />
        </mask>
      </defs>
      <Landscape />
      <g mask="url(#fuji-reflection-mask)">
        <g transform={mirror}>
          <Landscape />
        </g>
      </g>
    </svg>
  )
}
