// Small pieces shared by the 737 performance calculators. They live at module level on purpose: when a
// component is defined inside another component's body, every re-render makes a new component type, so
// React rebuilds its DOM and a focused button loses focus (Tab then restarts from the top of the page).

export const SectionHeader = ({ title }) => (
  <div className="cp-section-header">
    <span className="cp-section-title">{title}</span>
    <div className="cp-divider" />
  </div>
)

export const ChoiceBtn = ({ active, onClick, children, accentColor }) => (
  <button
    onClick={onClick}
    style={{
      background: active ? 'var(--cp-accdim)' : 'transparent',
      border: `1px solid ${active ? (accentColor || 'var(--cp-acc)') : 'var(--cp-border)'}`,
      borderRadius: 4,
      color: active ? (accentColor || 'var(--cp-acc)') : 'var(--cp-dim)',
      fontFamily: 'var(--cb-font-mono)',
      fontSize: 12,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      padding: '7px 18px',
      cursor: 'pointer',
      transition: 'all 0.15s',
    }}
  >
    {children}
  </button>
)
