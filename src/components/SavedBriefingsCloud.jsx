import { useState } from 'react'
import useDutyLogStore from '../modules/dutylog/store/dutylogStore'
import { CODE_RE } from '../modules/dutylog/services/sync'
import { viewBriefings, importBriefings, openCloudBriefing } from '../services/briefingCloud'
import { ROLE_COLORS } from '../utils/metarSeverity'
import { formatSnapshotStamp } from '../utils/savedBriefings'
import ScanViewfinderLoader from '../modules/dutylog/components/ScanViewfinderLoader'
import QrScanner from '../modules/dutylog/components/QrScanner'
import { usePresence } from '../useTransitionAnim'
import Collapse from './Collapse'
import { Dots } from './SyncStatus'

const mono = 'var(--cb-font-mono)'
const hint = { fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.04em', lineHeight: 1.5 }

// What a Saved Briefings row shows, from briefingRow(): used by the saved list and the cloud list.
// `status` (the sync badge) sits at the right end of the "saved" line.
export function BriefingRowText({ r, status, logged, action }) {
  const join = (...parts) => parts.filter(Boolean).join(' · ')
  const times = [r.std && `STD ${r.std}`, r.sta && `STA ${r.sta}`].filter(Boolean).join(' → ')
  const detail = { fontFamily: mono, fontSize: 12, color: 'var(--cp-dim)', marginTop: 3 }
  return (
    <>
      {r.customName && <div style={{ fontFamily: mono, fontSize: 13, color: 'var(--cp-txt)', marginBottom: 3 }}>{r.customName}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {r.flight && <span style={{ fontFamily: mono, fontSize: 15, color: 'var(--cp-txt)' }}>{r.flight}</span>}
        <span style={{ fontFamily: mono, fontSize: 14 }}>
          <span style={{ color: ROLE_COLORS['DEPARTURE'] }}>{r.dep}</span> → <span style={{ color: ROLE_COLORS['ARRIVAL'] }}>{r.arr}</span>
        </span>
        <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.12em', padding: '1px 6px', borderRadius: 4,
          ...(r.isOfp ? { background: 'var(--cp-accdim)', color: 'var(--cp-acc)' } : { border: '1px solid var(--cp-border)', color: 'var(--cp-dim)' }) }}>
          {r.isOfp ? 'OFP' : 'MANUAL'}
        </span>
      </div>
      {r.isOfp && (
        <>
          <div style={detail}>{join(r.tail, r.type, r.ofpNo && `OFP ${r.ofpNo}`)}</div>
          <div style={{ ...detail, marginTop: 2 }}>{join(times, r.stdDate)}</div>
        </>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--cp-dim)' }}>saved {formatSnapshotStamp(r.savedAt)}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {logged != null && (
            <span style={{
              fontFamily: mono, fontSize: 8, letterSpacing: '0.08em', borderRadius: 4, padding: '2px 6px',
              ...(logged ? { color: 'var(--cp-green)', border: '1px solid var(--cp-green)' } : { color: 'var(--cp-dim)', border: '1px solid var(--cp-border2)' }),
            }}>{logged ? 'LOGGED' : 'NOT LOGGED'}</span>
          )}
          {status}
          {action}
        </span>
      </div>
    </>
  )
}

// "Have a code? Enter here to view it" — laid out like the Duty Log's: read-only look at the saved
// briefings behind a sync code (typed, picked from the recent codes, or scanned), then optionally
// import them (replaces the list on this device). The code is the Duty Log's, and so is the list
// of recent codes: importing makes the code this device's code.
export function CloudView() {
  const deviceCode = useDutyLogStore(s => s.syncCode)
  const viewCodeHistory = useDutyLogStore(s => s.viewCodeHistory)
  const addViewCode = useDutyLogStore(s => s.addViewCode)
  const removeViewCode = useDutyLogStore(s => s.removeViewCode)
  const [input, setInput] = useState('')
  const [viewed, setViewed] = useState(null)   // { code, items }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [viewing, setViewing] = useState('')   // the code being looked up, while the list loads
  const [scanning, setScanning] = useState(false)
  const scanPresence = usePresence(scanning)

  const view = async (typed) => {
    const code = (typed ?? input).trim().toUpperCase()
    if (!CODE_RE.test(code)) { setError('Code must look like XXXX-XXXX-XXXX'); return }
    setError(''); setViewing(code); setConfirm(false)
    try { setViewed({ code, items: await viewBriefings(code) }); addViewCode(code) } catch (e) { setError(e.message) }
    setViewing('')
  }

  // A scanned code that has the shape of a sync code is looked up straight away; anything else
  // just fills the box.
  const handleScan = (data) => {
    setScanning(false)
    const code = (data || '').trim().toUpperCase()
    setInput(code)
    if (CODE_RE.test(code)) view(code)
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
      <div style={{ ...hint, fontSize: 8, marginBottom: 8 }}>
        View the saved briefings behind a sync code without changing anything on this device. You can choose to import them below.
      </div>
      <button onClick={() => setScanning(true)} className="cp-btn" style={{ width: '100%', padding: '8px 10px', marginBottom: 8 }}>TAP TO SCAN</button>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="XXXX-XXXX-XXXX" className="cp-input" style={{ flex: 1 }}
          aria-label="Sync code" />
        <button onClick={() => view()} disabled={!!viewing || busy || !input.trim()} className="cp-btn" style={{ padding: '8px 10px' }}>{viewing ? <Dots>VIEW</Dots> : 'VIEW'}</button>
      </div>

      {viewCodeHistory.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {viewCodeHistory.map((code) => (
            <span key={code} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontFamily: mono, fontSize: 9, letterSpacing: '0.06em', color: 'var(--cp-txt)',
              background: 'var(--cp-bg3)', border: '1px solid var(--cp-border2)', borderRadius: 4,
              padding: '4px 4px 4px 8px',
            }}>
              <button onClick={() => { setInput(code); view(code) }} disabled={!!viewing}
                style={{ background: 'none', border: 'none', color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit', cursor: 'pointer', padding: 0 }}>{code}</button>
              <button onClick={() => removeViewCode(code)} aria-label={`remove ${code}`}
                style={{ background: 'none', border: 'none', color: 'var(--cp-dim)', cursor: 'pointer', padding: '0 2px', fontSize: 11, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}

      {error && <div style={{ ...hint, fontSize: 8, color: 'var(--cp-red)', marginTop: 6 }}>{error}</div>}

      {scanPresence.mounted && (
        <QrScanner onResult={handleScan} onClose={() => setScanning(false)} closing={scanPresence.closing} />
      )}

      {/* Same loader as the Duty Log's code lookup. */}
      <Collapse open={!!viewing}>
        <div style={{ marginTop: 14, border: '1px solid var(--cp-border)', borderRadius: 6, padding: 12 }}>
          <ScanViewfinderLoader code={viewing} />
        </div>
      </Collapse>

      {!viewing && viewed && (
        <div style={{ marginTop: 14, border: '1px solid var(--cp-border)', borderRadius: 6, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-acc)', letterSpacing: '0.08em' }}>VIEWING · {viewed.code} · READ-ONLY</span>
            <button onClick={() => { setViewed(null); setConfirm(false) }} className="cp-btn" style={{ fontSize: 8, padding: '3px 7px' }}>CLOSE</button>
          </div>
          {viewed.items.length === 0 ? (
            <div style={hint}>NO SAVED BRIEFINGS FOUND FOR THIS CODE</div>
          ) : (
            <>
              <div style={{ ...hint, marginBottom: 6 }}>
                Tap one to open it read-only. {viewed.items.length} briefing{viewed.items.length === 1 ? '' : 's'}
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--cp-border)', borderRadius: 8, padding: 8, marginBottom: 10 }}>
                {[...viewed.items].sort((a, b) => b.savedAt - a.savedAt).map(i => (
                  <button key={i.id} onClick={() => openOne(i.id)} disabled={!!opening} aria-busy={opening === i.id}
                    style={{
                      position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      padding: '10px 12px', marginBottom: 8, borderRadius: 10, cursor: 'pointer', color: 'inherit', background: 'var(--cp-bg2)',
                      border: `1px solid ${opening === i.id ? 'var(--cp-acc)' : 'var(--cp-border)'}`,
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Briefings uploaded before rows existed have only a name until the next SYNC. */}
                      {i.row ? <BriefingRowText r={i.row} /> : <div style={{ fontFamily: mono, fontSize: 13 }}>{i.name}</div>}
                    </div>
                    {opening === i.id
                      ? <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.14em', color: 'var(--cp-acc)', flexShrink: 0 }}><Dots>OPENING</Dots></span>
                      : <span style={{ color: 'var(--cp-dim)', fontSize: 18, flexShrink: 0 }} aria-hidden="true">›</span>}
                    {opening === i.id && <span className="cp-row-bar" />}
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
                {busy ? <Dots>IMPORTING</Dots> : confirm ? 'TAP AGAIN TO CONFIRM' : `IMPORT ${viewed.items.length} BRIEFING${viewed.items.length === 1 ? '' : 'S'}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
