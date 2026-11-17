import { useGlide } from './useGlide'

// Folder-style tabs (eLogbook's tab bar): the saved briefing window's sections, and the Satellite tab's views.
// The highlight under the active tab is one moving element (.cp-bf-ind in oxygen.css, see useGlide.jsx); the tabs
// themselves never move, so hovering one shows no line. There is no baseline under the row, and the gap below it
// sits outside the clipping box, so the highlight's glow stops at the tab's edge like eLogbook's.
// `counts` is an optional { tabId: number } badge.
export default function BriefingTabBar({ tabs, active, onSelect, counts = {} }) {
  const { rowRef, indicator } = useGlide(active)

  return (
    <div style={{ overflowX: 'auto', overflowY: 'hidden', marginBottom: 16 }}>
      <div ref={rowRef} role="tablist" style={{ position: 'relative', display: 'flex', gap: 4, alignItems: 'flex-end' }}>
        {indicator}
        {tabs.map(tab => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              className="cp-bf-tab"
              onClick={() => onSelect(tab.id)}
              style={{
                position: 'relative', zIndex: 1,
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
                padding: '7px 16px', borderRadius: '5px 5px 0 0', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                background: 'transparent',
                border: `1px solid ${isActive ? 'transparent' : 'var(--cp-border2)'}`,
                color: isActive ? 'var(--cp-acc)' : 'var(--cp-dim)',
                transition: 'color 0.15s',
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
