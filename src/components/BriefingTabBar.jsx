import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Folder-style tabs (eLogbook's tab bar): the saved briefing window's sections, and the Satellite tab's views.
// The highlight under the active tab is one moving element (.cp-bf-ind in oxygen.css) that glides between tabs
// and bleeds 1px over the row's divider line; the tabs themselves never move, so hovering one shows no line.
// `counts` is an optional { tabId: number } badge.
export default function BriefingTabBar({ tabs, active, onSelect, counts = {} }) {
  const rowRef = useRef(null)
  const [ind, setInd] = useState(null)
  const [armed, setArmed] = useState(false) // first placement is instant, later moves glide

  useLayoutEffect(() => {
    const row = rowRef.current
    const measure = () => {
      const el = row.querySelector('[aria-selected="true"]')
      const next = el ? { left: el.offsetLeft, width: el.offsetWidth } : null
      setInd(p => (p && next && p.left === next.left && p.width === next.width ? p : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(row)
    document.fonts?.ready.then(measure)
    return () => ro.disconnect()
  }, [active]) // tab or badge width changes are caught by the ResizeObserver

  useEffect(() => { setArmed(true) }, [])

  return (
    <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
      <div ref={rowRef} role="tablist" style={{ position: 'relative', display: 'flex', gap: 4, alignItems: 'flex-end', borderBottom: '1px solid var(--cp-border2)', marginBottom: 16 }}>
        {ind && <i className={`cp-bf-ind${armed ? ' cp-bf-ind-go' : ''}`} aria-hidden="true" style={{ width: ind.width, transform: `translateX(${ind.left}px)` }} />}
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
