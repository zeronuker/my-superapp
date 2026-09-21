import { useState } from 'react'
import { createPortal } from 'react-dom'

// Standardized reset button: visibly orange by default (no hover needed to
// read as "careful"), escalates to red on hover/press as the action is about
// to actually fire. Opens a confirm modal — window.confirm can't be styled
// or offer more than OK/Cancel.
// `scoped` modules (METAR/TAF, NOTAM, SIGMET) share a cache and the Flight
// Briefing, so their modal offers module-only vs all-3 and calls
// onReset('module' | 'all'). Everything else gets a single-button confirm
// and calls onReset() with no scope.
// `hasUnsavedBriefing`/`onDiscardBriefing` (scoped only): when a freshly
// fetched, never-saved briefing is open, both reset options also discard
// it (never a saved one) — the modal warns about that specifically instead
// of the old always-shown "also resets Flight Briefing" line.
// `options`/`copy` (scoped only): override the two choices and the intro
// line for modules whose reset isn't the module/all-3-modules briefing
// choice (e.g. Gatefinder's fields-only vs fields-and-results). Each option
// is { value, label, desc, danger }. Omit both to get the default
// module/all-3 wording.
export default function ResetButton({ onReset, scoped = false, hasUnsavedBriefing = false, onDiscardBriefing, options, copy }) {
  const [hover, setHover] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [open, setOpen] = useState(false)

  const colors = pressed || hover
    ? { borderColor: 'var(--cp-red)', color: 'var(--cp-red)', background: pressed ? 'rgba(239,68,68,0.20)' : 'rgba(239,68,68,0.10)' }
    : { borderColor: 'rgba(251,146,60,0.4)', color: 'var(--cp-orange)', background: 'rgba(251,146,60,0.08)' }

  const choose = (scope) => { setOpen(false); onDiscardBriefing?.(); onReset(scope) }

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

      {open && createPortal(
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
              CONFIRM RESET
            </div>
            {scoped && hasUnsavedBriefing ? (
              <div style={{
                fontSize: 12, color: 'var(--cp-red)', lineHeight: 1.5, marginBottom: 18,
                padding: '8px 10px', background: 'rgba(248,113,113,0.08)',
                borderLeft: '2px solid var(--cp-red)', borderRadius: 3,
              }}>
                Any unsaved Flight Briefing will be deleted.
              </div>
            ) : scoped && copy ? (
              <div style={{ fontSize: 12, color: 'var(--cp-dim)', lineHeight: 1.5, marginBottom: 18 }}>
                {copy}
              </div>
            ) : !scoped && (
              <div style={{ fontSize: 12, color: 'var(--cp-dim)', lineHeight: 1.5, marginBottom: 18 }}>
                Clears every entered field and fetched result on this tab. Can't be undone.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scoped ? (
                options ? (
                  options.map(opt => (
                    <button key={opt.value} onClick={() => choose(opt.value)} style={{
                      padding: '10px 14px', borderRadius: 5, cursor: 'pointer', textAlign: 'left',
                      border: `1px solid ${opt.danger ? 'rgba(239,68,68,0.4)' : 'var(--cp-border2)'}`,
                      background: opt.danger ? 'rgba(239,68,68,0.10)' : 'var(--cp-bg3)',
                      color: opt.danger ? 'var(--cp-red)' : 'var(--cp-txt)',
                      fontFamily: 'var(--cb-font-mono)', fontSize: 12, letterSpacing: '0.03em',
                    }}>
                      {opt.label}
                      {opt.desc && (
                        <span style={{
                          display: 'block', fontFamily: 'var(--cb-font-body)', letterSpacing: 0,
                          fontSize: 11, color: opt.danger ? 'var(--cp-red)' : 'var(--cp-dim)',
                          opacity: opt.danger ? 0.75 : 1, marginTop: 3, fontWeight: 400,
                        }}>
                          {opt.desc}
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  <>
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
                  </>
                )
              ) : (
                <button onClick={() => choose()} style={{
                  padding: '10px 14px', borderRadius: 5, cursor: 'pointer', textAlign: 'left',
                  border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.10)', color: 'var(--cp-red)',
                  fontFamily: 'var(--cb-font-mono)', fontSize: 12, letterSpacing: '0.03em',
                }}>
                  Reset
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{
                padding: '10px 14px', borderRadius: 5, cursor: 'pointer', textAlign: 'center',
                border: '1px solid transparent', background: 'none', color: 'var(--cp-dim)',
                fontFamily: 'var(--cb-font-mono)', fontSize: 12, letterSpacing: '0.03em',
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
