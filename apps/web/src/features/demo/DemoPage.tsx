import { useEffect } from 'react'
import { SceneLayer } from '../../ui/stage/SceneLayer'
import { GlassFilters } from '../../ui/styles/GlassFilters'
import { DemoPlayer } from './DemoPlayer'
import './demo.css'

/** /demo: the player alone, full-bleed over the softly blurred Sakasa Fuji world, for the video and the booth. */
export default function DemoPage() {
  useEffect(() => {
    const previous = document.title
    document.title = 'Demo · Meigi'
    return () => {
      document.title = previous
    }
  }, [])
  return (
    <div className="demo-page">
      <div className="demo-page__world" aria-hidden="true">
        <SceneLayer />
      </div>
      <GlassFilters />
      <main className="demo-page__main">
        <h1 className="sr-only">Meigi demo</h1>
        <DemoPlayer variant="full" />
      </main>
    </div>
  )
}
