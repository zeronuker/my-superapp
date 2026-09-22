// Fallback shown while a lazily-loaded tab chunk is fetched.
export default function TabLoading({ compact }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      padding: compact ? '16px 0' : '48px 0',
      fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.18em',
      color: 'var(--cp-dim)',
    }}>
      <span className="cp-spinner" style={{
        width: 12, height: 12, borderRadius: '50%',
        border: '2px solid var(--cp-border)', borderTopColor: 'var(--cp-acc)',
        display: 'inline-block', animation: 'cp-spin 0.7s linear infinite',
      }} />
      LOADING…
    </div>
  )
}
