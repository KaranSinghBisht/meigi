import { Component, type ReactNode } from 'react'

interface StageBoundaryProps {
  readonly onError: () => void
  readonly children: ReactNode
}

interface StageBoundaryState {
  readonly failed: boolean
}

/** Catches WebGL/context creation failures so the page can swap to the SVG scene. */
export class StageBoundary extends Component<StageBoundaryProps, StageBoundaryState> {
  override state: StageBoundaryState = { failed: false }

  static getDerivedStateFromError(): StageBoundaryState {
    return { failed: true }
  }

  override componentDidCatch(): void {
    this.props.onError()
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
