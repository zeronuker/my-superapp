import { useState } from 'react'
import { usePresence } from '../useTransitionAnim'

const mono = 'var(--cb-font-mono)'

// The chip every "link / attach" control uses (Briefing: DUTY LOG, OFP · Duty Log: BRIEFING):
// dashed "+ NAME" while nothing is attached, solid "NAME ▾" with a small menu once it is.
const chipBase = { fontFamily: mono, fontSize: 10, letterSpacing: '0.08em', fontWeight: 500, cursor: 'pointer', padding: '5px 9px', borderRadius: 4, whiteSpace: 'nowrap' }
const CHIP_ON = { color: 'var(--cp-acc)', background: 'var(--cp-accdim)', border: '1px solid var(--cp-acc)' }
const CHIP_OFF = { color: 'var(--cp-dim)', background: 'transparent', border: '1px dashed var(--cp-border)' }
const CHIP_DISABLED = { opacity: 0.4, cursor: 'not-allowed' }

// `set` = solid (something is there already) instead of dashed, for a chip that opens straight away rather than a menu.
export function AddChip({ label, onClick, disabled, set }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...chipBase, ...(set ? CHIP_ON : CHIP_OFF), ...(disabled ? CHIP_DISABLED : {}) }}>{label}</button>
  )
}

// items: [{ label, onClick, color?, disabled? } | { heading }]. `align` is the side of the chip the menu lines up with.
export function MenuChip({ label, items, disabled, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const presence = usePresence(open)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled} aria-haspopup="menu" aria-expanded={open}
        style={{ ...chipBase, ...CHIP_ON, ...(disabled ? CHIP_DISABLED : {}) }}>{label} ▾</button>
      {presence.mounted && (
        <>
          {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />}
          <div role="menu" className={`cp-drop-in${presence.closing ? ' is-closing' : ''}`} style={{
            position: 'absolute', [align]: 0, top: 'calc(100% + 4px)', zIndex: 10, minWidth: 180,
            background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.4)', overflow: 'hidden',
          }}>
            {items.map(it => it.heading ? (
              <div key={it.heading} style={{ padding: '8px 12px 2px', fontFamily: mono, fontSize: 9, letterSpacing: '0.06em', color: 'var(--cp-dim)' }}>{it.heading}</div>
            ) : (
              <button key={it.label} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick() }} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none',
                cursor: it.disabled ? 'not-allowed' : 'pointer', opacity: it.disabled ? 0.4 : 1,
                fontFamily: mono, fontSize: 11, color: it.color || 'var(--cp-txt)',
              }}>{it.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
