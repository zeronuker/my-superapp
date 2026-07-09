/**
 * Navigation chrome — three user-selectable styles (set in Settings → General):
 *   'tabs'     → horizontal tab bar (top or bottom)
 *   'grouped'  → category tabs + a sub-row of the active group's tools
 *   'launcher' → home grid of tool cards (default)
 *
 * All variants take the same inputs (the ordered calculator list + the active
 * id + an onSelect callback), so switching styles never loses your place.
 */

import { TabIcon } from './TabIcon'

// Category map for 'grouped' mode. New modules must be added to a group here
// to appear in grouped navigation. `iconId` points at a representative member
// so image icon sets reuse that tool's artwork for the group header.
export const NAV_GROUPS = [
  { id: 'calc', label: 'CALCULATOR(s)', icon: '🧮',  iconId: 'calculator', members: ['calculator', 'interpolation', 'currency'] },
  { id: 'avdata', label: 'FLIGHT DATA', icon: '🌤️', iconId: 'metartaf', members: ['metartaf', 'notam', 'traffic'] },
  { id: 'avops',  label: 'FLIGHT OPS',  icon: '⏳',  iconId: 'ftl',      members: ['ftl', 'edto', 'dutylog', 'worldtime'] },
  { id: 'pray', label: 'PRAYER',        icon: '🕌',  iconId: 'prayer',     members: ['prayer'] },
]

// ── Tabs (top or bottom) ──────────────────────────────────────────────────────
export function TabBar({ calcs, activeId, onSelect, position = 'top' }) {
  const bar = (
    <div className="cp-tab-bar" style={{
      maxWidth: 960, margin: '0 auto', display: 'flex', gap: 4,
      flexWrap: 'nowrap', overflowX: 'auto',
      paddingTop: position === 'top' ? 12 : 6,
      paddingBottom: position === 'top' ? 1 : 6,
    }}>
      {calcs.map(calc => (
        <button key={calc.id} onClick={() => onSelect(calc.id)}
          className={`cp-tab${activeId === calc.id ? ' active' : ''}`}>
          <TabIcon id={calc.id} emoji={calc.icon} size={26} style={{ marginRight: 6 }} />
          {calc.name}
        </button>
      ))}
    </div>
  )

  if (position === 'bottom') {
    return (
      <nav aria-label="Calculators" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50,
        background: 'var(--cp-bg3)', borderTop: '1px solid var(--cp-border)',
        padding: '0 12px', paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {bar}
      </nav>
    )
  }
  return (
    <nav aria-label="Calculators" style={{
      background: 'var(--cp-bg3)', borderBottom: '1px solid var(--cp-border)', padding: '0 24px',
    }}>
      {bar}
    </nav>
  )
}

// ── Grouped (categories + sub-row) ────────────────────────────────────────────
export function GroupedNav({ calcs, activeId, onSelect }) {
  const byId = Object.fromEntries(calcs.map(c => [c.id, c]))

  // Only groups that actually have available members (defensive against removals)
  const groups = NAV_GROUPS
    .map(g => ({ ...g, calcs: g.members.map(id => byId[id]).filter(Boolean) }))
    .filter(g => g.calcs.length > 0)

  const activeGroup = groups.find(g => g.calcs.some(c => c.id === activeId)) || groups[0]

  return (
    <nav aria-label="Calculators" style={{
      background: 'var(--cp-bg3)', borderBottom: '1px solid var(--cp-border)', padding: '0 16px',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Category row */}
        <div style={{ display: 'flex', gap: 4, paddingTop: 8 }}>
          {groups.map(g => {
            const on = g.id === activeGroup?.id
            return (
              <button key={g.id} onClick={() => onSelect(g.calcs[0].id)} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                background: on ? 'var(--cp-accdim)' : 'transparent',
                border: 'none', borderBottom: `2px solid ${on ? 'var(--cp-acc)' : 'transparent'}`,
                borderTopLeftRadius: 4, borderTopRightRadius: 4,
                padding: '8px 4px', minHeight: 48, cursor: 'pointer',
                fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.1em',
                color: on ? 'var(--cp-acc)' : 'var(--cp-dim)', transition: 'all 0.12s',
              }}>
                <TabIcon id={g.iconId} emoji={g.icon} size={26} />{g.label}
              </button>
            )
          })}
        </div>

        {/* Sub-row — only when the active group has more than one tool */}
        {activeGroup && activeGroup.calcs.length > 1 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto',
            padding: '8px 0 9px', borderTop: '1px solid var(--cp-border3)' }}>
            {activeGroup.calcs.map(c => {
              const on = c.id === activeId
              return (
                <button key={c.id} onClick={() => onSelect(c.id)} style={{
                  whiteSpace: 'nowrap', background: 'transparent', border: 'none',
                  cursor: 'pointer', padding: '3px 4px',
                  fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.08em',
                  color: on ? 'var(--cp-acc)' : 'var(--cp-dim)',
                  borderBottom: `2px solid ${on ? 'var(--cp-acc)' : 'transparent'}`,
                }}>
                  {c.name}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </nav>
  )
}

// ── Launcher: home grid ───────────────────────────────────────────────────────
export function LauncherGrid({ calcs, onSelect }) {
  const byId = Object.fromEntries(calcs.map(c => [c.id, c]))
  const groupedIds = new Set(NAV_GROUPS.flatMap(g => g.members))

  const groups = [
    ...NAV_GROUPS
      .map(g => ({ ...g, calcs: g.members.map(id => byId[id]).filter(Boolean) }))
      .filter(g => g.calcs.length > 0),
    ...(calcs.some(c => !groupedIds.has(c.id))
      ? [{ id: 'other', label: 'OTHER', icon: '⋯', calcs: calcs.filter(c => !groupedIds.has(c.id)) }]
      : []),
  ]

  let cardIdx = 0

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {groups.map(group => (
        <div key={group.id} style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.18em',
            color: 'var(--cp-dim)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <TabIcon id={group.iconId} emoji={group.icon} size={24} />
            {group.label}
            <div style={{ flex: 1, height: 1, background: 'var(--cp-border2)' }} />
          </div>

          <div className="cp-launcher-grid">
            {group.calcs.map(calc => {
              const delay = (cardIdx++) * 35
              return (
                <button key={calc.id} onClick={() => onSelect(calc.id)}
                  className="cp-launch-card cp-calc-fade"
                  style={{
                    animationDelay: `${delay}ms`, animationFillMode: 'both',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 10, padding: '22px 12px', cursor: 'pointer',
                    border: '1px solid var(--cp-border2)', borderRadius: 8,
                    color: 'var(--cp-txt)', transition: 'border-color 0.12s, background 0.12s',
                  }}>
                  <TabIcon id={calc.id} emoji={calc.icon} size={52} />
                  <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11,
                    letterSpacing: '0.1em', color: 'var(--cp-muted)', textAlign: 'center' }}>
                    {calc.name.toUpperCase()}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// Slim bar shown above a tool when it's opened from the launcher.
export function LauncherBackBar({ calc, onHome }) {
  return (
    <nav aria-label="Navigation" style={{
      background: 'var(--cp-bg3)', borderBottom: '1px solid var(--cp-border)', padding: '0 24px',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center',
        gap: 12, padding: '8px 0' }}>
        <button onClick={onHome} className="cp-btn"
          style={{ padding: '5px 12px', fontSize: 11, letterSpacing: '0.12em' }}>
          ◄ HOME
        </button>
        {calc && (
          <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.14em',
            color: 'var(--cp-acc)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <TabIcon id={calc.id} emoji={calc.icon} size={24} />{calc.name.toUpperCase()}
          </span>
        )}
      </div>
    </nav>
  )
}
