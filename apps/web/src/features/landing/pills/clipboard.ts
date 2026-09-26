function copyWithSelection(text: string): void {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  // execCommand is deprecated but remains the only path on some embedded
  // browsers without the async clipboard API.
  const ok = document.execCommand('copy')
  area.remove()
  previousFocus?.focus({ preventScroll: true })
  if (!ok) throw new Error('Copy command was rejected')
}

/** Copies text, falling back to a hidden textarea when the API is blocked. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Permission denied or unfocused document: try the legacy path below.
    }
  }
  copyWithSelection(text)
}
