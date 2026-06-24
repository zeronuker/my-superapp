import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

const mono = 'var(--cb-font-mono)'

// ── Fake demo data — nothing here touches Firebase or the real dutylog store ──
const FAKE_CODE = 'XK7B-9PQR-2MNT'
const now = Date.now()
const seedOwnerLogs = () => ([
  { id: '1', date: 'JUN 24 2026', route: 'MH370 · WMKK → OMDB', updatedAt: now,                synced: false },
  { id: '2', date: 'JUN 23 2026', route: 'MH002 · WSSS → WMKK', updatedAt: now - 26 * 3600_000, synced: true  },
  { id: '3', date: 'JUN 21 2026', route: 'MH148 · VHHH → WMKK', updatedAt: now - 70 * 3600_000, synced: true  },
])
const FAKE_CLOUD_SNAPSHOT = [
  { id: 'c1', date: 'JUN 20 2026', route: 'MH149 · WMKK → VHHH' },
  { id: 'c2', date: 'JUN 18 2026', route: 'MH001 · WMKK → WSSS' },
]

function Dot({ color }) {
  return <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: color }} />
}

function Toast({ children, actions }) {
  return (
    <div style={{
      background: 'var(--cp-accdim)', border: '1px solid var(--cp-acc)', borderRadius: 6,
      padding: '10px 12px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontFamily: mono, fontSize: 10, color: 'var(--cp-txt)', letterSpacing: '0.04em', lineHeight: 1.5 }}>
        {children}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>{actions}</div>
    </div>
  )
}

export default function DutyLogSyncDemo() {
  const [screen, setScreen] = useState('dutylog') // 'dutylog' | 'settings'

  // "myCode" = the sync code this demo device owns (null = no backup set up yet)
  const [myCode, setMyCode] = useState(null)
  const [logs, setLogs] = useState([])
  const [newLogPrompt, setNewLogPrompt] = useState(false)

  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [restoreInput, setRestoreInput] = useState('')
  const [viewInput, setViewInput] = useState('')
  const [viewedCode, setViewedCode] = useState(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [confirmImport, setConfirmImport] = useState(false)

  useEffect(() => {
    if (!myCode) { setQrDataUrl(''); return }
    QRCode.toDataURL(myCode, { margin: 1, width: 160 }).then(setQrDataUrl).catch(() => setQrDataUrl(''))
  }, [myCode])

  // ── Demo scenario presets — just for exploring the design, not real state ──
  const presetNone = () => { setMyCode(null); setLogs([]); setViewedCode(null); setConfirmImport(false); setNewLogPrompt(false) }
  const presetOwner = () => { setMyCode(FAKE_CODE); setLogs(seedOwnerLogs()); setViewedCode(null); setConfirmImport(false); setNewLogPrompt(false) }

  const createCode = () => { setMyCode(FAKE_CODE); setLogs(seedOwnerLogs()) }

  const handleNewLog = () => {
    setLogs(ls => [{ id: String(Date.now()), date: 'JUN 24 2026', route: 'NEW ENTRY · — → —', updatedAt: Date.now(), synced: false }, ...ls])
    setNewLogPrompt(true)
  }

  const syncAll = () => {
    setLogs(ls => ls.map(l => ({ ...l, synced: true })))
    setNewLogPrompt(false)
  }

  const handleRestore = () => {
    if (!restoreInput.trim()) return
    setMyCode(restoreInput.trim().toUpperCase())
    setLogs(FAKE_CLOUD_SNAPSHOT.map(l => ({ ...l, synced: true, updatedAt: Date.now() - 3600_000 })))
    setRestoreInput('')
    setConfirmRestore(false)
  }

  const handleView = () => {
    if (!viewInput.trim()) return
    setViewedCode(viewInput.trim().toUpperCase())
  }

  const handleImport = () => {
    setMyCode(viewedCode)
    setLogs(FAKE_CLOUD_SNAPSHOT.map(l => ({ ...l, synced: true, updatedAt: Date.now() - 3600_000 })))
    setViewedCode(null)
    setConfirmImport(false)
  }

  const unsyncedCount = logs.filter(l => !l.synced).length

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      {/* Demo controls — not part of the real UI, just for exploring states */}
      <div style={{
        border: '1px dashed var(--cp-border2)', borderRadius: 6, padding: 10, marginBottom: 20,
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.08em' }}>DEMO STATE:</span>
        <button onClick={presetNone} className="cp-btn" style={{ fontSize: 9, padding: '4px 8px' }}>NO CODE YET</button>
        <button onClick={presetOwner} className="cp-btn" style={{ fontSize: 9, padding: '4px 8px' }}>OWNER (HAS CODE)</button>
        <div style={{ width: '100%', height: 1, background: 'var(--cp-border2)', margin: '4px 0' }} />
        <button onClick={() => setScreen('dutylog')} className="cp-btn" style={{ fontSize: 9, padding: '4px 8px', ...(screen === 'dutylog' ? { borderColor: 'var(--cp-acc)', color: 'var(--cp-acc)' } : {}) }}>SCREEN: DUTY LOG</button>
        <button onClick={() => setScreen('settings')} className="cp-btn" style={{ fontSize: 9, padding: '4px 8px', ...(screen === 'settings' ? { borderColor: 'var(--cp-acc)', color: 'var(--cp-acc)' } : {}) }}>SCREEN: SETTINGS</button>
      </div>

      {screen === 'dutylog' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: 'var(--cp-txt)', letterSpacing: '0.05em' }}>DUTY LOG</span>
            <button onClick={handleNewLog} className="cp-btn" style={{ fontSize: 10, padding: '6px 12px' }}>+ NEW</button>
          </div>

          {!myCode && (
            <div style={{
              fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.04em',
              lineHeight: 1.6, border: '1px solid var(--cp-border)', borderRadius: 6, padding: '10px 12px', marginBottom: 14,
            }}>
              ℹ No cloud sync set up yet. <span onClick={() => setScreen('settings')} style={{ color: 'var(--cp-acc)', cursor: 'pointer', textDecoration: 'underline' }}>Set up Backup &amp; Sync in Settings</span> to keep an off-device copy.
            </div>
          )}

          {newLogPrompt && (
            myCode ? (
              <Toast actions={<>
                <button onClick={syncAll} className="cp-btn" style={{ fontSize: 9, padding: '5px 10px' }}>SYNC NOW</button>
                <button onClick={() => setNewLogPrompt(false)} className="cp-btn" style={{ fontSize: 9, padding: '5px 10px' }}>LATER</button>
              </>}>
                New duty log saved locally. Sync it to the cloud now?
              </Toast>
            ) : (
              <Toast actions={<>
                <button onClick={() => { setScreen('settings'); setNewLogPrompt(false) }} className="cp-btn" style={{ fontSize: 9, padding: '5px 10px' }}>GO TO SETTINGS</button>
                <button onClick={() => setNewLogPrompt(false)} className="cp-btn" style={{ fontSize: 9, padding: '5px 10px' }}>LATER</button>
              </>}>
                New duty log saved locally. Set up cloud sync in Settings to back it up.
              </Toast>
            )
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {logs.map(l => (
              <div key={l.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)', borderRadius: 6, padding: '10px 12px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: 'var(--cp-txt)' }}>{l.date}</div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', marginTop: 2 }}>{l.route}</div>
                </div>
                {myCode ? (
                  l.synced ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <Dot color="var(--cp-green)" />
                      <span style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-green)', letterSpacing: '0.06em' }}>SYNCED</span>
                    </div>
                  ) : (
                    <button onClick={syncAll} className="cp-btn" style={{ fontSize: 8, padding: '4px 8px', flexShrink: 0 }}>
                      ○ SYNC
                    </button>
                  )
                ) : (
                  <span style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-dim)', letterSpacing: '0.06em', flexShrink: 0 }}>NOT BACKED UP</span>
                )}
              </div>
            ))}
          </div>

          {myCode && unsyncedCount > 0 && (
            <div style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-dim)', marginTop: 10, lineHeight: 1.5 }}>
              Tapping SYNC on any entry pushes all {unsyncedCount} unsynced log{unsyncedCount === 1 ? '' : 's'} at once — the cloud copy is a single snapshot, not synced entry-by-entry.
            </div>
          )}

          <div className="cp-divider" style={{ margin: '18px 0' }} />

          {/* View — read-only, no ownership change, with an optional import escalation */}
          <div className="cp-label" style={{ marginBottom: 6 }}>Have a code? Enter here to view it</div>
          <div style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-dim)', letterSpacing: '0.04em', lineHeight: 1.5, marginBottom: 8 }}>
            View another device's synced logs without changing anything on this device. You can choose to import them below.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={viewInput} onChange={e => setViewInput(e.target.value)} placeholder="XXXX-XXXX-XXXX" className="cp-input" style={{ flex: 1 }} />
            <button onClick={handleView} disabled={!viewInput.trim()} className="cp-btn" style={{ padding: '8px 10px' }}>VIEW</button>
          </div>

          {viewedCode && (
            <div style={{ marginTop: 14, border: '1px solid var(--cp-border)', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-acc)', letterSpacing: '0.08em' }}>VIEWING · {viewedCode} · READ-ONLY</span>
                <button onClick={() => { setViewedCode(null); setConfirmImport(false) }} className="cp-btn" style={{ fontSize: 8, padding: '3px 7px' }}>CLOSE</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {FAKE_CLOUD_SNAPSHOT.map(l => (
                  <div key={l.id} style={{ background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)', borderRadius: 4, padding: '8px 10px' }}>
                    <div style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: 'var(--cp-txt)' }}>{l.date}</div>
                    <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', marginTop: 2 }}>{l.route}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => (confirmImport ? handleImport() : setConfirmImport(true))} className="cp-btn-danger cp-btn" style={{ width: '100%', padding: '8px 10px' }}>
                {confirmImport ? 'CONFIRM IMPORT' : 'IMPORT TO THIS DEVICE'}
              </button>
              {confirmImport && (
                <div style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-red)', letterSpacing: '0.04em', marginTop: 6, lineHeight: 1.5 }}>
                  This will overwrite all logs currently on this device and make this device the owner of {viewedCode}. This action is not reversible.
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: 'var(--cp-txt)', letterSpacing: '0.05em', marginBottom: 14 }}>
            SETTINGS · BACKUP &amp; SYNC
          </div>

          {/* Status card */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)', borderRadius: 6, padding: '10px 12px', marginBottom: 14,
          }}>
            <Dot color={myCode ? 'var(--cp-green)' : 'var(--cp-dim)'} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.06em', color: 'var(--cp-txt)' }}>
                {myCode ? 'OWNER OF THIS CODE' : 'NO BACKUP ON THIS DEVICE'}
              </div>
              {myCode && (
                <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.08em', marginTop: 2 }}>{myCode}</div>
              )}
            </div>
            {myCode && (
              <button onClick={syncAll} className="cp-btn" style={{ padding: '6px 10px', fontSize: 9, flexShrink: 0 }}>SYNC</button>
            )}
          </div>

          {myCode ? (
            <div style={{ marginBottom: 18 }}>
              {qrDataUrl && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                  <img src={qrDataUrl} alt="Sync code QR" style={{ width: 150, height: 150, borderRadius: 6 }} />
                </div>
              )}
              <button
                onClick={() => { navigator.clipboard?.writeText(myCode); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
                className="cp-btn" style={{ width: '100%', padding: '8px 10px', marginBottom: 8 }}
              >{copied ? 'COPIED' : 'COPY CODE'}</button>
              <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.04em', lineHeight: 1.6 }}>
                Code &amp; QR stay visible here any time — e.g. to set up a second device. Only this device can push updates while it owns this code.
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.04em', lineHeight: 1.6, marginBottom: 10 }}>
                Create a sync code to back up your duty logs to the cloud.
              </div>
              <button onClick={createCode} className="cp-btn" style={{ width: '100%', padding: '8px 10px' }}>CREATE SYNC CODE</button>
            </div>
          )}

          <div className="cp-divider" style={{ margin: '16px 0' }} />

          {/* Restore — destructive, transfers ownership */}
          <div className="cp-label" style={{ marginBottom: 6 }}>Restore from a code</div>
          <div style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-dim)', letterSpacing: '0.04em', lineHeight: 1.5, marginBottom: 8 }}>
            Replaces logs on this device and makes this device the owner. The previous owner device will stop being able to push until it links a new code.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: confirmRestore ? 8 : 0 }}>
            <input value={restoreInput} onChange={e => { setRestoreInput(e.target.value); setConfirmRestore(false) }} placeholder="XXXX-XXXX-XXXX" className="cp-input" style={{ flex: 1 }} />
            <button onClick={() => (confirmRestore ? handleRestore() : setConfirmRestore(true))} disabled={!restoreInput.trim()} className="cp-btn-danger cp-btn" style={{ padding: '8px 10px' }}>
              {confirmRestore ? 'CONFIRM' : 'RESTORE'}
            </button>
          </div>
          {confirmRestore && (
            <div style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-red)', letterSpacing: '0.04em', marginTop: 6 }}>
              This overwrites all logs on this device. Tap CONFIRM to proceed.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
