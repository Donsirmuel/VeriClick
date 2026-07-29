import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('[ErrorBoundary]', error.message, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex items-center justify-center min-h-64 p-8">
          <div className="text-center">
            <h2 className="text-lg font-bold text-error mb-2">Something went wrong</h2>
            <p className="text-sm text-muted mb-4">{this.state.error?.message}</p>
            <button
              onClick={this.handleRetry}
              className="bg-black hover:bg-neutral-800 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
