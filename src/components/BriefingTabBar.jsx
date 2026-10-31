// Folder-style tabs (eLogbook's tab bar): the saved briefing window's sections, and the Satellite tab's views.
// The active tab's own -1px bottom margin bleeds over the row's divider line. `counts` is an optional { tabId: number } badge.
export default function BriefingTabBar({ tabs, active, onSelect, counts = {} }) {
  return (
    <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', borderBottom: '1px solid var(--cp-border2)', marginBottom: 16 }}>
        {tabs.map(tab => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              className="cp-bf-tab"
              onClick={() => onSelect(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
                padding: '7px 16px', borderRadius: '5px 5px 0 0', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                background: isActive ? 'var(--cp-bg)' : 'transparent',
                borderTop: isActive ? '2px solid var(--cp-acc)' : '1px solid var(--cp-border2)',
                borderLeft: '1px solid var(--cp-border2)',
                borderRight: '1px solid var(--cp-border2)',
                borderBottom: isActive ? '1px solid var(--cp-bg)' : '1px solid var(--cp-border2)',
                color: isActive ? 'var(--cp-acc)' : 'var(--cp-dim)',
                marginBottom: isActive ? -1 : 0,
              }}
            >
              {tab.label}
              {counts[tab.id] != null && <span style={{
                fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                background: isActive ? 'var(--cp-bg2)' : 'var(--cp-bg3)',
                color: isActive ? 'var(--cp-txt)' : 'var(--cp-dim)',
              }}>{counts[tab.id]}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
