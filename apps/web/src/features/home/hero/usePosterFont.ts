import { useEffect } from 'react'

const FONT_ID = 'home-noto-sans-jp-black'
// Black for the poster line, Bold for the Japanese the ASCII pieces draw. Google serves both in unicode-range slices,
// so a visit downloads only the slices those characters fall in.
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=swap'

/** The poster's Japanese is set in Noto Sans JP Black; the app doesn't load it elsewhere, so the page does, once. */
export function usePosterFont(): void {
  useEffect(() => {
    if (document.getElementById(FONT_ID)) return
    const link = document.createElement('link')
    link.id = FONT_ID
    link.rel = 'stylesheet'
    link.href = FONT_URL
    document.head.append(link)
  }, [])
}
