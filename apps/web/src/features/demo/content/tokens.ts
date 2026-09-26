// Shortened tokens ("0x9B4f…47e4", "0x24b128e8…03b3f1") must never wrap at their ellipsis: a word joiner after
// it removes that one break opportunity, and renders as nothing.

const JOINED = '…⁠'

export function keepTokens(text: string): string {
  return text.replaceAll('…', JOINED)
}
