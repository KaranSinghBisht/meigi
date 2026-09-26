/**
 * The lens bend for Liquid Glass (see glass.css): a soft, low-frequency displacement of the world behind the
 * header capsule and the enter button. Only Chromium applies an SVG filter in backdrop-filter, so the class that
 * uses it (html.lg-refract) is only set there, and never when someone asked for less transparency or more contrast.
 */
export function GlassFilters() {
  return (
    <svg className="lg-filters" aria-hidden="true" focusable="false">
      <filter id="lg-lens" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.02" numOctaves={2} seed={11} result="noise" />
        <feGaussianBlur in="noise" stdDeviation="3" result="smooth" />
        <feDisplacementMap in="SourceGraphic" in2="smooth" scale="18" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}

interface BrandedNavigator extends Navigator {
  readonly userAgentData?: { readonly brands?: readonly { readonly brand: string }[] }
}

/** Marks the page for refraction where it works (Chromium) and is wanted. */
export function enableRefraction(): void {
  const brands = (navigator as BrandedNavigator).userAgentData?.brands ?? []
  const chromium = brands.some((entry) => entry.brand === 'Chromium')
  const plain = window.matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)').matches
  if (chromium && !plain) document.documentElement.classList.add('lg-refract')
}
