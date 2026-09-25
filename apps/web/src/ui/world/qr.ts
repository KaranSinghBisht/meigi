import QRCode from 'qrcode'

/** The connector link as an SVG data URL, so it renders as a plain <img> (no HTML injection). */
export async function qrDataUrl(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#2a2730', light: '#ffffff' },
  })
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
