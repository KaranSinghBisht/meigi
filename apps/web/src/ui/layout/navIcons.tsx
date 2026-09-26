// Line icons for the app's navigation: 24 px, 1.6 px round strokes in currentColor, drawn inline (no icon set).

export type NavIconName =
  | 'overview'
  | 'try'
  | 'agent'
  | 'payees'
  | 'register'
  | 'changes'
  | 'payments'
  | 'business'
  | 'menu'
  | 'close'

const PATHS: Record<NavIconName, string[]> = {
  overview: ['M4 4h6.5v6.5H4z', 'M13.5 4H20v6.5h-6.5z', 'M4 13.5h6.5V20H4z', 'M13.5 13.5H20V20h-6.5z'],
  try: ['M10 6h10', 'M10 12h10', 'M10 18h10', 'M4 6l1.2 1.2L7.5 5', 'M4 12l1.2 1.2L7.5 11', 'M4 18l1.2 1.2L7.5 17'],
  agent: [
    'M7 8h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3z',
    'M12 4v4',
    'M9.5 13h.01',
    'M14.5 13h.01',
    'M10 16.5h4',
  ],
  payees: [
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M3 20a6 6 0 0 1 12 0',
    'M16 4.5a3.5 3.5 0 0 1 0 6.5',
    'M18 14.5a6 6 0 0 1 3 5.5',
  ],
  register: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M12 11.5v6', 'M9 14.5h6'],
  changes: ['M4 8h13l-3.5-3.5', 'M20 16H7l3.5 3.5'],
  payments: [
    'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M3 10h18',
    'M13 13.5l-2 3h3l-2 3',
  ],
  business: ['M4 8h16v11H4z', 'M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2', 'M4 13h16'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
}

export function NavIcon({ name }: { readonly name: NavIconName }) {
  return (
    <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name].map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
