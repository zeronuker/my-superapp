import { useState } from 'react'

// Standardized reset button: visibly orange by default (no hover needed to
// read as "careful"), escalates to red on hover/press as the action is about
// to actually fire. Opens a modal to pick the scope — window.confirm can't
// offer more than OK/Cancel — then calls onReset('module' | 'all').
export default function ResetButton({ onReset }) {
  const [hover, setHover] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [open, setOpen] = useState(false)

  const colors = pressed || hover
    ? { borderColor: 'var(--cp-red)', color: 'var(--cp-red)', background: pressed ? 'rgba(239,68,68,0.20)' : 'rgba(239,68,68,0.10)' }
    : { borderColor: 'rgba(251,146,60,0.4)', color: 'var(--cp-orange)', background: 'rgba(251,146,60,0.08)' }

  const choose = (scope) => { setOpen(false); onReset(scope) }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <button
        onClick={() => setOpen(true)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); setPressed(false) }}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        style={{
          fontFamily: 'var(--cb-font-mono)', fontSize: 12, letterSpacing: '0.15em',
          textTransform: 'uppercase', padding: '7px 16px', borderRadius: 4,
          border: '1px solid', cursor: 'pointer', transition: 'all 0.12s',
          ...colors,
        }}
      >↺ RESET</button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
        >
          <div
            className="cp-card-bg2"
            onClick={e => e.stopPropagation()}
            style={{
              border: '1px solid var(--cp-border2)', borderRadius: 8,
              width: '100%', maxWidth: 340, padding: 18,
            }}
          >
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--cp-txt)', marginBottom: 6 }}>
              RESET WHAT?
            </div>
            <div style={{ fontSize: 12, color: 'var(--cp-dim)', lineHeight: 1.5, marginBottom: 18 }}>
              Either option also clears the Flight Briefing cache.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => choose('module')} style={{
                padding: '10px 14px', borderRadius: 5, cursor: 'pointer', textAlign: 'left',
                border: '1px solid var(--cp-border2)', background: 'var(--cp-bg3)', color: 'var(--cp-txt)',
                fontFamily: 'var(--cb-font-mono)', fontSize: 12, letterSpacing: '0.03em',
              }}>
                Reset this module only
              </button>
              <button onClick={() => choose('all')} style={{
                padding: '10px 14px', borderRadius: 5, cursor: 'pointer', textAlign: 'left',
                border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.10)', color: 'var(--cp-red)',
                fontFamily: 'var(--cb-font-mono)', fontSize: 12, letterSpacing: '0.03em',
              }}>
                Reset all 3 modules
              </button>
              <button onClick={() => setOpen(false)} style={{
                padding: '10px 14px', borderRadius: 5, cursor: 'pointer', textAlign: 'center',
                border: '1px solid transparent', background: 'none', color: 'var(--cp-dim)',
                fontFamily: 'var(--cb-font-mono)', fontSize: 12, letterSpacing: '0.03em',
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
