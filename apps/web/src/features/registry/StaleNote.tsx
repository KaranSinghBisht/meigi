import { Notice } from '../../ui/components/Notice'

/** Shown when a background re-read failed and the card is the last good snapshot. */
export function StaleNote({ message, readAt }: { readonly message: string | null; readonly readAt: Date }) {
  if (!message) return null
  return (
    <Notice tone="warn" title={`Showing the reading from ${readAt.toLocaleTimeString('en-GB')}.`}>
      <p>{message} Retrying every 30 seconds.</p>
    </Notice>
  )
}
