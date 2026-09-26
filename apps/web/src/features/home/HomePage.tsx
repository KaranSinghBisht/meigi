import { PosterHero } from './hero/PosterHero'
import { Story } from './story/Story'
import './home.css'

/** /start: the poster over the world, then the story of what Meigi checks, told in glyphs. */
export function HomePage() {
  return (
    <div className="home">
      <PosterHero />
      <Story />
    </div>
  )
}
