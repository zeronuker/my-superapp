import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import useDutyLogStore from './store/dutylogStore'
import LogList from './pages/LogList'
import LogEditor from './pages/LogEditor'
import { generateSyncCode, pushLogs, pullLogs } from './services/sync'
import { relativeTimeFromNow } from './utils/relativeTime'
import QrScanner from './components/QrScanner'

const mono = 'var(--cb-font-mono)'

export default function DutyLogModule() {
  const {
    logs, editingId, setEditingId, createLog,
    updateLog, deleteLog,
    addAircraft, removeAircraft, updateAircraft,
    addSector, removeSector, updateSector,
    addCrew, updateCrew, removeCrew,
  } = useDutyLogStore()

  const editing = logs.find(l => l.id === editingId)

  // If the log being edited disappears (e.g. deleted), fall back to the list.
  useEffect(() => {
    if (editingId && !editing) setEditingId(null)
  }, [editingId, editing])

  const actions = { updateLog, deleteLog, addAircraft, removeAircraft, updateAircraft, addSector, removeSector, updateSector, addCrew, updateCrew, removeCrew }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      {editing ? (
        <LogEditor
          log={editing}
          actions={actions}
          onBack={() => setEditingId(null)}
          onDelete={(id) => { deleteLog(id); setEditingId(null) }}
        />
      ) : (
        <LogList
          logs={logs}
          onNew={() => setEditingId(createLog())}
          onOpen={setEditingId}
          onDelete={deleteLog}
        />
      )}
    </div>
  )
}

export function DutyLogBackupSync() {
  const logs = useDutyLogStore(s => s.logs)
  const syncCode = useDutyLogStore(s => s.syncCode)
  const lastSyncedAt = useDutyLogStore(s => s.lastSyncedAt)
  const markSynced = useDutyLogStore(s => s.markSynced)
  const replaceLogs = useDutyLogStore(s => s.replaceLogs)

  const [tab, setTab] = useState(() => (syncCode ? 'backup' : 'restore'))
  const [copied, setCopied] = useState(false)
  const [restoreCode, setRestoreCode] = useState('')
  const [busy, setBusy] = useState(null) // null | 'backup' | 'restore'
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!syncCode) { setQrDataUrl(''); return }
    QRCode.toDataURL(syncCode, { margin: 1, width: 180 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [syncCode])

  const runBackup = async () => {
    setError('')
    setBusy('backup')
    try {
      const code = syncCode || generateSyncCode()
      await pushLogs(code, logs)
      markSynced(code)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const handleCopy = () => {
    if (!syncCode) return
    navigator.clipboard?.writeText(syncCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const runRestore = async (rawCode) => {
    const code = rawCode.trim().toUpperCase()
    if (!code) return
    if (!window.confirm('Restoring will replace all logs currently on this device. Continue?')) return
    setError('')
    setBusy('restore')
    try {
      const restored = await pullLogs(code)
      replaceLogs(restored)
      markSynced(code)
      setRestoreCode('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const handleScanResult = (data) => {
    setScanning(false)
    runRestore(data)
  }

  const relTime = relativeTimeFromNow(lastSyncedAt, now)

  return (
    <div>
      {/* Status card */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)',
        borderRadius: 6, padding: '10px 12px', marginBottom: 14,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: syncCode ? 'var(--cp-green)' : 'var(--cp-dim)',
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.06em', color: 'var(--cp-txt)' }}>
            {syncCode ? (relTime ? `LAST SYNCED · ${relTime}` : 'BACKUP READY') : 'NO BACKUP ON THIS DEVICE'}
          </div>
          {syncCode && (
            <div style={{ fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.08em', marginTop: 2 }}>
              {syncCode}
            </div>
          )}
        </div>
        {syncCode && (
          <button
            onClick={runBackup}
            disabled={busy === 'backup'}
            className="cp-btn"
            style={{ padding: '6px 10px', fontSize: 9, flexShrink: 0 }}
          >{busy === 'backup' ? '…' : 'SYNC'}</button>
        )}
      </div>

      {/* Segmented tabs */}
      <div style={{ display: 'flex', border: '1px solid var(--cp-border)', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
        {[{ value: 'backup', label: 'BACKUP' }, { value: 'restore', label: 'RESTORE' }].map((opt, i) => {
          const active = tab === opt.value
          return (
            <button key={opt.value} onClick={() => setTab(opt.value)} style={{
              flex: 1,
              background:   active ? 'var(--cp-accdim)' : 'transparent',
              border:       'none',
              borderRight:  i === 0 ? '1px solid var(--cp-border)' : 'none',
              color:        active ? 'var(--cp-acc)' : 'var(--cp-dim)',
              fontFamily:   mono,
              fontSize:     10,
              letterSpacing:'0.1em',
              padding:      '8px 10px',
              cursor:       'pointer',
            }}>{opt.label}</button>
          )
        })}
      </div>

      {tab === 'backup' ? (
        syncCode ? (
          <div>
            {qrDataUrl && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <img src={qrDataUrl} alt="Backup code QR" style={{ width: 160, height: 160, borderRadius: 6 }} />
              </div>
            )}
            <button
              onClick={handleCopy}
              className="cp-btn"
              style={{ width: '100%', padding: '8px 10px', marginBottom: 8 }}
            >{copied ? 'COPIED' : 'COPY CODE'}</button>
            <div style={{
              fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.06em',
              lineHeight: 1.6,
            }}>
              Save this code somewhere safe, or screenshot the QR. Anyone with this code can view or restore these logs.
            </div>
          </div>
        ) : (
          <div>
            <div style={{
              fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.06em',
              lineHeight: 1.6, marginBottom: 10,
            }}>
              Back up your logs to the cloud and get a code you can use to restore them on another device.
            </div>
            <button
              onClick={runBackup}
              disabled={busy === 'backup'}
              className="cp-btn"
              style={{ width: '100%', padding: '8px 10px' }}
            >{busy === 'backup' ? 'BACKING UP…' : 'BACKUP NOW'}</button>
          </div>
        )
      ) : (
        <div>
          <button
            onClick={() => setScanning(true)}
            disabled={busy === 'restore'}
            className="cp-btn"
            style={{ width: '100%', padding: '8px 10px', marginBottom: 10 }}
          >TAP TO SCAN</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={restoreCode}
              onChange={(e) => setRestoreCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX"
              className="cp-input"
              style={{ flex: 1 }}
            />
            <button
              onClick={() => runRestore(restoreCode)}
              disabled={busy === 'restore' || !restoreCode.trim()}
              className="cp-btn"
              style={{ padding: '8px 10px' }}
            >{busy === 'restore' ? 'RESTORING…' : 'RESTORE'}</button>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          fontFamily: mono, fontSize: 9, color: 'var(--cp-red)', letterSpacing: '0.06em',
          lineHeight: 1.6, marginTop: 10,
        }}>{error}</div>
      )}

      {scanning && (
        <QrScanner onResult={handleScanResult} onClose={() => setScanning(false)} />
      )}
    </div>
  )
}
