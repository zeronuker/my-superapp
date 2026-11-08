import { useCallback, useEffect, useRef, useState } from 'react'
import { listInbox, fetchInboxOfp, removeInboxOfp } from '../services/cvrInbox'
import { Dots, SyncBar } from './SyncStatus'
import Collapse from './Collapse'
import { animDurationMs } from '../useTransitionAnim'

// The Briefing New page's "From CVR" list: OFPs the CVR bookmark (public/cvr-send.js) sent to this
// device's sync code. It checks on open, whenever the app comes back to the screen (the pilot sends
// from Safari, then switches back), and on REFRESH. Tapping a row downloads it, reads it like an
// imported file (`readText(text)` -> readOfpFile's result), shows ✓ on the row, and only then hands it
// to `onLoaded(r)` — opening it puts the tall OFP card above this list and pushes the row off screen.
// × removes a row. Each step stays on screen for at least MIN_STEP_MS and a success for DONE_MS, so the
// pilot can read what happened.
const MIN_STEP_MS = 700
const DONE_MS = 1800
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const atLeast = (p, ms = MIN_STEP_MS) => Promise.all([p, sleep(ms)]).then(([v]) => v)
const sentAt = (ms) => `SENT ${new Date(ms).toUTCString().slice(5, 22).toUpperCase()}Z`

const mono = 'var(--cb-font-mono)'
const line = { fontSize: 11, color: 'var(--cp-dim)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }

export default function FromCvr({ syncCode, isOnline, disabled, readText, onLoaded, panelStyle, buttonStyle }) {
  const [items, setItems] = useState(null)          // [{ id, label, sentAt }] once loaded
  const [checking, setChecking] = useState(false)
  const [note, setNote] = useState('')               // after a check: '✓ UP TO DATE' / '✓ 1 NEW'
  const [error, setError] = useState('')
  const [row, setRow] = useState(null)               // { id, step: 'downloading' | 'reading' | 'done' | 'removing' }
  const [gone, setGone] = useState(() => new Set())  // removed rows, folding away
  const [fresh, setFresh] = useState(() => new Set()) // rows that arrived since the last check
  const seen = useRef(null)
  const busy = useRef(false)
  const noteTimer = useRef(null)
  useEffect(() => () => clearTimeout(noteTimer.current), [])

  const refresh = useCallback(async () => {
    if (!syncCode || !isOnline || busy.current) return
    busy.current = true
    setChecking(true); setError(''); setNote('')
    try {
      const list = await atLeast(listInbox(syncCode).catch(e => (/no backup/.test(e.message) ? [] : Promise.reject(e))))
      const added = seen.current ? list.filter(i => !seen.current.has(i.id)).map(i => i.id) : []
      if (seen.current) {
        setNote(added.length ? `✓ ${added.length} NEW` : '✓ UP TO DATE')
        clearTimeout(noteTimer.current)
        noteTimer.current = setTimeout(() => setNote(''), DONE_MS)
      }
      seen.current = new Set(list.map(i => i.id))
      setFresh(new Set(added))
      setGone(new Set())
      setItems(list)
    } catch (e) { setError(e.message) }
    setChecking(false)
    busy.current = false
  }, [syncCode, isOnline])

  // On open, and each time the app comes back to the screen.
  useEffect(() => {
    refresh()
    const onShow = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [refresh])

  const read = async (id) => {
    busy.current = true
    setError('')
    try {
      setRow({ id, step: 'downloading' })
      const text = await atLeast(fetchInboxOfp(syncCode, id))
      setRow({ id, step: 'reading' })
      const r = await atLeast(readText(text))
      if (!r.ok) throw new Error(r.error)
      setRow({ id, step: 'done' })
      await sleep(DONE_MS)
      setRow(null)
      busy.current = false
      await onLoaded(r)
      return
    } catch (e) { setError(`Couldn't load that OFP: ${e.message}`) }
    setRow(null)
    busy.current = false
  }

  const remove = async (id) => {
    busy.current = true
    setError('')
    try {
      setRow({ id, step: 'removing' })
      await atLeast(removeInboxOfp(syncCode, id))
      setGone(g => new Set(g).add(id))
      await sleep(animDurationMs())
      setItems(list => list.filter(i => i.id !== id))
      seen.current?.delete(id)
    } catch (e) { setError(e.message) }
    setRow(null)
    busy.current = false
  }

  const stepText = (step) => step === 'done'
    ? <span className="cp-pop" style={{ color: 'var(--cp-green)', display: 'inline-block' }}>✓ OFP READ — OPENING IT</span>
    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--cp-acc)' }}>
        <span className="cp-spinner" aria-hidden="true" />
        <Dots>{{ downloading: 'DOWNLOADING', reading: 'READING OFP', removing: 'REMOVING' }[step]}</Dots>
      </span>

  return (
    <div style={{ ...panelStyle, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className="cp-label" style={{ margin: 0, color: 'var(--cp-acc)' }}>FROM CVR</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {note && <span className="cp-pop" role="status" style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.08em', color: 'var(--cp-green)' }}>{note}</span>}
          {isOnline && (
            <button className="cp-btn" onClick={refresh} disabled={checking || !!row}
              style={{ ...buttonStyle, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {checking ? <><span className="cp-spinner" aria-hidden="true" /><Dots>CHECKING</Dots></> : '↻ REFRESH'}
            </button>
          )}
        </span>
      </div>

      {!isOnline ? (
        <div style={line}>Offline — connect to see the OFPs sent from CVR.</div>
      ) : items === null ? (
        checking && <div role="status" style={{ ...line, color: 'var(--cp-acc)' }}><span className="cp-spinner" aria-hidden="true" /><Dots>CHECKING FOR OFPS SENT FROM CVR</Dots></div>
      ) : items.length === 0 ? (
        <div style={line}>Nothing sent yet. On cvr.batikair.com.my, tap the SuperApp OFP bookmark, then come back here.</div>
      ) : items.map(i => {
        const mine = row?.id === i.id
        return (
          <Collapse key={i.id} open={!gone.has(i.id)}>
            <div className={fresh.has(i.id) ? 'cp-calc-fade' : undefined} style={{
              position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
              borderBottom: '1px solid var(--cp-border3)',
            }}>
              <button className="cp-btn" onClick={() => read(i.id)} disabled={!!row || checking || disabled}
                style={{ ...buttonStyle, flex: 1, textAlign: 'left', letterSpacing: '0.08em', fontSize: 12,
                  ...(mine ? { borderColor: 'var(--cp-acc)', opacity: 1 } : {}) }}>
                {i.label}
                {fresh.has(i.id) && <span className="cp-pop" style={{ display: 'inline-block', marginLeft: 8, fontSize: 9, color: 'var(--cp-green)' }}>NEW</span>}
                <span role={mine ? 'status' : undefined} style={{ display: 'block', fontSize: 9, color: 'var(--cp-dim)', marginTop: 3 }}>
                  {mine ? stepText(row.step) : sentAt(i.sentAt)}
                </span>
              </button>
              <button onClick={() => remove(i.id)} disabled={!!row || checking} title="Remove" aria-label={`Remove ${i.label}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cp-dim)', fontSize: 18, lineHeight: 1, padding: '0 4px', opacity: row ? 0.4 : 1 }}>×</button>
              <SyncBar active={mine && row.step !== 'done'} />
            </div>
          </Collapse>
        )
      })}

      <Collapse open={!!error}><div style={{ fontSize: 12, marginTop: 10, color: 'var(--cp-yellow)' }}>{error}</div></Collapse>
      <SyncBar active={checking && items !== null} />
    </div>
  )
}
