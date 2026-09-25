interface RippleCaptionProps {
  readonly visible: boolean
}

/** Shown once, the first time someone disturbs the water. */
export function RippleCaption({ visible }: RippleCaptionProps) {
  return (
    <p className={visible ? 'caption is-visible' : 'caption'} aria-hidden={!visible}>
      Anyone can bend the reflection. <span className="caption__turn">No one can move the mountain.</span>
    </p>
  )
}
