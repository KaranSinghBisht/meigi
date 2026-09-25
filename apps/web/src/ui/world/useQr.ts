import { useEffect, useState } from 'react'
import { qrDataUrl } from './qr'

export interface Qr {
  readonly src: string | null
  readonly failed: boolean
}

/** A QR code of `uri`, drawn once per link; `failed` means the link is still usable, just not scannable. */
export function useQr(uri: string | null): Qr {
  const [qr, setQr] = useState<Qr>({ src: null, failed: false })
  useEffect(() => {
    if (!uri) return
    let live = true
    qrDataUrl(uri).then(
      (src) => live && setQr({ src, failed: false }),
      () => live && setQr({ src: null, failed: true }),
    )
    return () => {
      live = false
    }
  }, [uri])
  return qr
}
