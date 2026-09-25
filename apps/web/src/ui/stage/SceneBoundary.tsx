import { Component, type ReactNode } from 'react'

interface SceneBoundaryProps {
  readonly onError: () => void
  readonly children: ReactNode
}

/** A stage chunk that fails to load (or a canvas that throws) falls back to the still world, never a blank app. */
export class SceneBoundary extends Component<SceneBoundaryProps, { readonly failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(): void {
    this.props.onError()
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
