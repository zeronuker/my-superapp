import React from 'react'

/**
 * Per-tab error boundary.
 *
 * React unmounts the whole tree when a render throws and nothing catches it —
 * which would white-screen the entire app. Wrapping each calculator in its own
 * boundary isolates a crash to that one tab; every other tab keeps working.
 *
 * Error boundaries must be class components — there is no hook equivalent for
 * componentDidCatch / getDerivedStateFromError.
 *
 * Reset strategy: the parent passes a `resetKey` (the active tab id). When it
 * changes, the boundary clears its error state so switching away from and back
 * to a crashed tab gives it a fresh attempt.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Surface the crash to the console so it can be diagnosed (and picked up
    // by any logging that hooks console.error).
    console.error(
      `[ErrorBoundary] "${this.props.name ?? 'tab'}" crashed:`,
      error,
      info?.componentStack,
    )
  }

  componentDidUpdate(prevProps) {
    // Clear the error when the parent signals a context change (e.g. tab switch).
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const name = this.props.name ?? 'This tab'

    return (
      <div style={{
        padding: '32px 20px',
        textAlign: 'center',
        fontFamily: 'var(--cb-font-mono)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 14 }}>⚠️</div>

        <div style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.16em',
          color: 'var(--cp-red)', marginBottom: 10,
        }}>
          {name.toUpperCase()} HIT AN ERROR
        </div>

        <div style={{
          fontFamily: 'var(--cb-font-body)', fontSize: 13,
          color: 'var(--cp-dim)', lineHeight: 1.6,
          maxWidth: 380, margin: '0 auto 18px',
        }}>
          Something went wrong rendering this tab. Your other tabs are unaffected —
          you can retry, or switch to another tab and come back.
        </div>

        <button
          onClick={this.handleRetry}
          className="cp-btn"
          style={{
            borderColor: 'var(--cp-acc)',
            color: 'var(--cp-acc)',
            letterSpacing: '0.15em',
            marginBottom: 18,
          }}
        >
          ⟳  RETRY
        </button>

        {/* Collapsed technical detail for debugging */}
        <details style={{
          maxWidth: 520, margin: '0 auto', textAlign: 'left',
        }}>
          <summary style={{
            fontSize: 10, letterSpacing: '0.12em', color: 'var(--cp-dim)',
            cursor: 'pointer', userSelect: 'none',
          }}>
            DEBUG INFO — copy when reporting a bug
          </summary>
          <pre style={{
            marginTop: 8, padding: '10px 12px',
            background: 'var(--cp-bg3)',
            border: '1px solid var(--cp-border)',
            borderRadius: 4,
            fontSize: 11, lineHeight: 1.5,
            color: 'var(--cp-txt)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            overflowX: 'auto',
          }}>
            {String(error?.message || error)}
          </pre>
        </details>
      </div>
    )
  }
}
