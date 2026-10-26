import { useState } from 'react'
import useDutyLogStore from '../modules/dutylog/store/dutylogStore'
import { CODE_RE } from '../modules/dutylog/services/sync'
import { viewBriefings, importBriefings, openCloudBriefing } from '../services/briefingCloud'

const mono = 'var(--cb-font-mono)'
const hint = { fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.04em', lineHeight: 1.5 }

// Per-row backup status, like the Duty Log's: SYNCED once the cloud holds this save under
// its current name, otherwise a SYNC button (or "NOT BACKED UP" while the device has no code).
export function SyncBadge({ syncCode, synced, onSync, busy }) {
  if (!syncCode) return <span style={{ ...hint, fontSize: 8 }}>NOT BACKED UP</span>
  if (synced) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cp-green)' }} />
        <span style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-green)', letterSpacing: '0.06em' }}>SYNCED</span>
      </span>
    )
  }
  return <button className="cp-btn" onClick={onSync} disabled={busy} style={{ fontSize: 8, padding: '4px 8px' }}>{busy ? '…' : '○ SYNC'}</button>
}

// "Have a code? View it here" — read-only look at the saved briefings behind a sync code, then
// optionally import them (replaces the list on this device, like the Duty Log's import).
// The code is the Duty Log's: importing makes it this device's code.
export function CloudView() {
  const deviceCode = useDutyLogStore(s => s.syncCode)
  const [input, setInput] = useState(deviceCode || '')
  const [viewed, setViewed] = useState(null)   // { code, items }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)

  const view = async () => {
    const code = input.trim().toUpperCase()
    if (!CODE_RE.test(code)) { setError('Code must look like XXXX-XXXX-XXXX'); return }
    setError(''); setBusy(true); setConfirm(false)
    try { setViewed({ code, items: await viewBriefings(code) }) } catch (e) { setError(e.message) }
    setBusy(false)
  }

  const doImport = async () => {
    if (!confirm) { setConfirm(true); return }
    setError(''); setBusy(true)
    try { await importBriefings(viewed.code); setViewed(null); setConfirm(false) } catch (e) { setError(e.message) }
    setBusy(false)
  }

  const [opening, setOpening] = useState(null)   // id being downloaded
  const openOne = async (id) => {
    setError(''); setOpening(id)
    try { await openCloudBriefing(viewed.code, id) } catch (e) { setError(e.message) }
    setOpening(null)
  }

  const switches = viewed && deviceCode && viewed.code !== deviceCode
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="cp-label" style={{ marginBottom: 6 }}>Have a code? Enter here to view it</div>
      <div style={{ ...hint, marginBottom: 8 }}>
        View the saved briefings behind a sync code without changing anything on this device. You can choose to import them below.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="XXXX-XXXX-XXXX" className="cp-input" style={{ flex: 1 }}
          aria-label="Sync code" />
        <button onClick={view} disabled={busy || !input.trim()} className="cp-btn" style={{ padding: '8px 10px' }}>{busy && !viewed ? '…' : 'VIEW'}</button>
      </div>
      {error && <div style={{ ...hint, color: 'var(--cp-red)', marginTop: 6 }}>{error}</div>}

      {viewed && (
        <div style={{ marginTop: 14, border: '1px solid var(--cp-border)', borderRadius: 6, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-acc)', letterSpacing: '0.08em' }}>VIEWING · {viewed.code} · READ-ONLY</span>
            <button onClick={() => { setViewed(null); setConfirm(false) }} className="cp-btn" style={{ fontSize: 8, padding: '3px 7px' }}>CLOSE</button>
          </div>
          {viewed.items.length === 0 ? (
            <div style={hint}>NO SAVED BRIEFINGS FOUND FOR THIS CODE</div>
          ) : (
            <>
              <div style={{ ...hint, marginBottom: 6 }}>Tap one to open it read-only.</div>
              <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 10 }}>
                {[...viewed.items].sort((a, b) => b.savedAt - a.savedAt).map(i => (
                  <button key={i.id} onClick={() => openOne(i.id)} disabled={!!opening}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--cp-border3)',
                      cursor: 'pointer', color: 'inherit', fontFamily: mono, fontSize: 12, padding: '8px 0' }}>
                    {opening === i.id ? 'OPENING…' : i.name}
                  </button>
                ))}
              </div>
              {confirm && (
                <div style={{ ...hint, color: 'var(--cp-yellow)', marginBottom: 8 }}>
                  This replaces the saved briefings on this device with these {viewed.items.length}.
                  {switches ? ' It also makes this the sync code for this device and its Duty Logs.' : ''} Tap again to confirm.
                </div>
              )}
              <button onClick={doImport} disabled={busy} className="cp-btn" style={{ width: '100%', padding: '8px 10px' }}>
                {busy ? 'IMPORTING…' : confirm ? 'TAP AGAIN TO CONFIRM' : `IMPORT ${viewed.items.length} BRIEFING${viewed.items.length === 1 ? '' : 'S'}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
