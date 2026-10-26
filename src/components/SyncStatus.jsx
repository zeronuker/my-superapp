import { useEffect, useRef, useState } from 'react'

const mono = 'var(--cb-font-mono)'

// Loading text: "OPENING" with three dots lighting in turn.
export function Dots({ children }) {
  return <span>{children}<span className="cp-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></span>
}

// A row that is waiting for the sync in progress: teal border and a line sliding along its bottom.
// The row needs position: relative and overflow: hidden.
export const rowSyncing = (busy, synced) => !!busy && !synced
export const SyncBar = ({ active }) => (active ? <span className="cp-row-bar" /> : null)

// Per-row backup status for the Saved Briefings and Duty Log lists: NOT BACKED UP with no code,
// a SYNC button, a spinner with SYNCING while the sync runs, then SYNCED (popping in when the row
// has just finished syncing).
export function SyncStatus({ syncCode, synced, busy, onSync }) {
  const wasBusy = useRef(false)
  const timer = useRef(null)
  const [pop, setPop] = useState(false)
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (busy && !synced) { wasBusy.current = true; return }
    if (synced && wasBusy.current) {
      wasBusy.current = false
      setPop(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setPop(false), 2200)
    }
  }, [busy, synced])

  const text = { fontFamily: mono, fontSize: 8, letterSpacing: '0.06em' }
  if (!syncCode) return <span style={{ ...text, color: 'var(--cp-dim)', flexShrink: 0 }}>NOT BACKED UP</span>
  if (synced) {
    return (
      <span className={pop ? 'cp-pop' : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cp-green)' }} />
        <span style={{ ...text, color: 'var(--cp-green)' }}>SYNCED</span>
      </span>
    )
  }
  if (busy) {
    return (
      <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, ...text, color: 'var(--cp-acc)', letterSpacing: '0.1em' }}>
        <span className="cp-spinner" aria-hidden="true" /><Dots>SYNCING</Dots>
      </span>
    )
  }
  return (
    <button onClick={(e) => { e.stopPropagation(); onSync?.() }} className="cp-btn" style={{ fontSize: 8, padding: '4px 8px', flexShrink: 0 }}>○ SYNC</button>
  )
}
