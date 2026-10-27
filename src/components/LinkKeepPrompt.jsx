import { useEffect, useRef, useState } from 'react'
import ChamferFrame from '@brand/ChamferFrame'
import { usePresence } from '../useTransitionAnim'

const mono = 'var(--cb-font-mono)'

const CHOICES = [
  { id: 'keep', text: 'KEEP LINK', color: 'var(--cp-green)', background: 'var(--cp-accdim)' },
  { id: 'discard', text: 'DISCARD LINK', color: 'var(--cp-red)', background: 'transparent' },
]

// Asked when leaving an edited duty log that has links: keep or discard each one, or undo the edits.
// rows: [{ key, title, sub }]. Every row starts on KEEP. onConfirm gets { [key]: 'keep' | 'discard' }.
export default function LinkKeepPrompt({ open, title, subtitle, rows, onConfirm, onUndo }) {
  const presence = usePresence(open)
  const [choices, setChoices] = useState({})
  // Kept so the prompt can finish its exit animation after the parent has cleared its rows.
  const last = useRef({ title, subtitle, rows })
  if (open) last.current = { title, subtitle, rows }
  useEffect(() => { if (!open) setChoices({}) }, [open])

  if (!presence.mounted) return null
  const shown = last.current

  return (
    <div className={`cp-backdrop-in${presence.closing ? ' is-closing' : ''}`} style={{
      position: 'fixed', inset: 0, zIndex: 450, background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <ChamferFrame className={`cp-pop-in${presence.closing ? ' is-closing' : ''}`} pad="14px"
        style={{ width: '100%', maxWidth: 460, maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.12em', color: 'var(--cp-txt)' }}>{shown.title}</div>
        <div style={{ fontSize: 11, color: 'var(--cp-dim)', lineHeight: 1.5, margin: '4px 0 6px' }}>{shown.subtitle}</div>
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {shown.rows.map(r => {
            const picked = choices[r.key] ?? 'keep'
            return (
              <div key={r.key} style={{ marginTop: 8, padding: '9px 10px', borderRadius: 8, background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)' }}>
                <div style={{ fontFamily: mono, fontSize: 12, color: 'var(--cp-txt)' }}>{r.title}</div>
                <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--cp-dim)', margin: '3px 0 8px' }}>{r.sub}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {CHOICES.map(c => (
                    <button key={c.id} onClick={() => setChoices(prev => ({ ...prev, [r.key]: c.id }))} aria-pressed={picked === c.id}
                      className="cp-btn" style={{
                        flex: 1, fontSize: 10, padding: '6px 8px',
                        ...(picked === c.id ? { color: c.color, borderColor: c.color, background: c.background } : {}),
                      }}>{c.text}</button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button onClick={onUndo} className="cp-btn" style={{ fontSize: 11 }}>UNDO CHANGES</button>
          <button onClick={() => onConfirm(choices)} className="cp-btn"
            style={{ fontSize: 11, color: 'var(--cp-acc)', borderColor: 'var(--cp-acc)', background: 'var(--cp-accdim)' }}>CONFIRM</button>
        </div>
      </ChamferFrame>
    </div>
  )
}
