import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled app error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <div className="auth-screen">
        <div className="auth-card glass" role="alert">
          <h2 style={{ marginTop: 0 }}>Kapteins Daagbok</h2>
          <p style={{ color: 'var(--app-text-muted)', lineHeight: 1.5 }}>
            Die App ist nach dem Neustart in einen fehlerhaften Zustand geraten. Bitte neu laden
            oder die App vollständig beenden und erneut öffnen.
          </p>
          <button type="button" className="btn primary" style={{ width: '100%', marginTop: 16 }} onClick={() => window.location.reload()}>
            Neu laden
          </button>
        </div>
      </div>
    )
  }
}
