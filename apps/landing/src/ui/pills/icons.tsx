interface IconProps {
  readonly className?: string
}

export function ArrowUpRight({ className = 'pill__icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
      <path d="M3.2 8.8 8.6 3.4M4.2 3.2h4.6v4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function ArrowDownRight({ className = 'pill__icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
      <path d="M3.2 3.2 8.6 8.6M8.8 4.2v4.6H4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
