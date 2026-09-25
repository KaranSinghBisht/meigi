import './brand.css'

interface HankoMarkProps {
  readonly size?: number
  readonly className?: string
}

/** The 名義 seal: vermilion, square, set vertically like a company hanko. Decorative; pair it with text. */
export function HankoMark({ size = 34, className }: HankoMarkProps) {
  return (
    <svg
      className={className ? `hanko ${className}` : 'hanko'}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="40" height="40" rx="8" fill="var(--seal)" />
      <rect x="3.5" y="3.5" width="33" height="33" rx="5.5" fill="none" stroke="#fff6f2" strokeWidth="1.4" />
      <text x="20" y="19" textAnchor="middle" className="hanko__glyph">
        名
      </text>
      <text x="20" y="33" textAnchor="middle" className="hanko__glyph">
        義
      </text>
    </svg>
  )
}
