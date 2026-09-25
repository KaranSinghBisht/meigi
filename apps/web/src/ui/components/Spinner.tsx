import './feedback.css'

/** A small ring spinner. Decorative: pair it with visible text or aria-busy on the owner. */
export function Spinner({ label }: { readonly label?: string }) {
  return (
    <span className="spinner" role={label ? 'status' : undefined} aria-hidden={label ? undefined : true}>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  )
}
