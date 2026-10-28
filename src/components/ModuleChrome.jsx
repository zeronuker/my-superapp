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
