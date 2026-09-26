/** The marketplace listing: static copy for each merchant card (not fetched — it doesn't change). */
export interface MerchantListing {
  readonly id: string
  readonly title: string
  readonly kind: string
  readonly tNumber: string | null
  readonly ens: string | null
  readonly price: string
  readonly body: string
}

export const MERCHANT_LISTINGS: readonly MerchantListing[] = [
  {
    id: 'minato',
    title: 'Minato GPU Cloud',
    kind: 'GPU compute',
    tNumber: 'T6999900000003',
    ens: 't6999900000003.payee.eth',
    price: '30 mJPYC / inference call · 15 mJPYC / GPU-minute',
    body: 'On-demand H100 inference and GPU-minutes, billed per call over x402.',
  },
  {
    id: 'fuji',
    title: 'Fuji Data',
    kind: 'Training data',
    tNumber: 'T8999900000001',
    ens: 't8999900000001.payee.eth',
    price: '20 mJPYC / slice',
    body: 'Invoice-OCR training data, sold per slice.',
  },
  {
    id: 'scrape',
    title: 'Public web scrape',
    kind: 'No Meigi record',
    tNumber: null,
    ens: null,
    price: '10 mJPYC / call',
    body: 'No T-number to check: an agent judges this one only by screening payTo, and only for small amounts.',
  },
]
