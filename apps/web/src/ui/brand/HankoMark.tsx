import './brand.css'

interface HankoMarkProps {
  readonly size?: number
  readonly className?: string
  /** Two characters set vertically: 名義 (the brand), 拒否 (refused), 承認 (approved). */
  readonly glyphs?: string
  readonly tone?: 'seal' | 'jade'
}

/** A square company seal (hanko), vermilion by default. Decorative; pair it with text. */
export function HankoMark({ size = 34, className, glyphs = '名義', tone = 'seal' }: HankoMarkProps) {
  const [top = '', bottom = ''] = Array.from(glyphs)
  return (
    <svg
      className={className ? `hanko ${className}` : 'hanko'}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="40" height="40" rx="8" fill={tone === 'jade' ? 'var(--jade-deep)' : 'var(--seal)'} />
      <rect x="3.5" y="3.5" width="33" height="33" rx="5.5" fill="none" stroke="#fff6f2" strokeWidth="1.4" />
      <text x="20" y="19" textAnchor="middle" className="hanko__glyph">
        {top}
      </text>
      <text x="20" y="33" textAnchor="middle" className="hanko__glyph">
        {bottom}
      </text>
    </svg>
  )
}
