const mono = 'var(--cb-font-mono)'

// The title block at the top of the Duty Log and Briefing list pages: title, accent subtitle, and
// an action button on the right. Shared so the two modules stay identical.
export function ModuleHeader({ title, subtitle, action, back }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      borderBottom: '1px solid var(--cp-border)', paddingBottom: 10, marginBottom: 14,
    }}>
      <div>
        {back}
        <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 500, letterSpacing: '0.12em', color: 'var(--cp-txt)' }}>{title}</div>
        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.16em', color: 'var(--cp-acc)' }}>{subtitle}</div>
      </div>
      {action}
    </div>
  )
}

// The blue "ℹ INFO" bar under the header.
export function InfoBanner({ children }) {
  return (
    <div style={{
      background: 'rgba(59,141,255,0.06)',
      border: '1px solid rgba(59,141,255,0.2)',
      borderLeft: '3px solid var(--cb-blue)',
      borderRadius: 4,
      padding: '10px 14px',
      fontFamily: mono,
      fontSize: 11,
      letterSpacing: '0.08em',
      lineHeight: 1.7,
      color: 'var(--cp-dim)',
      textAlign: 'justify',
      marginBottom: 14,
    }}>
      <span style={{ color: 'var(--cb-blue)', fontWeight: 700, letterSpacing: '0.15em' }}>ℹ INFO · </span>
      {children}
    </div>
  )
}
