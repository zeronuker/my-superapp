import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import useDutyLogStore from './store/dutylogStore'
import LogList from './pages/LogList'
import LogEditor from './pages/LogEditor'
import { generateSyncCode, pushLogs, viewLogs, claimAndRestore } from './services/sync'
import { relativeTimeFromNow } from './utils/relativeTime'
import QrScanner from './components/QrScanner'

const mono = 'var(--cb-font-mono)'

export default function DutyLogModule({ onOpenSettings }) {
  const {
    logs, editingId, setEditingId, createLog,
    updateLog, deleteLog,
    addAircraft, removeAircraft, updateAircraft,
    addSector, removeSector, updateSector,
    addCrew, updateCrew, removeCrew,
    syncCode, lastSyncedAt, markSynced, replaceLogs, ensureDeviceId,
  } = useDutyLogStore()

  const editing = logs.find(l => l.id === editingId)

  // Tracks the log created by the most recent "+ NEW" tap so the sync prompt
  // can fire once the user returns to the list, instead of immediately —
  // unlike the mockup's flat list, "+ NEW" here jumps straight into the editor.
  const [justCreatedId, setJustCreatedId] = useState(null)
  const [syncPromptId, setSyncPromptId] = useState(null)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncError, setSyncError] = useState('')

  // If the log being edited disappears (e.g. deleted), fall back to the list.
  useEffect(() => {
    if (editingId && !editing) setEditingId(null)
  }, [editingId, editing])

  const handleNew = () => {
    const id = createLog()
    setJustCreatedId(id)
    setEditingId(id)
  }

  const handleBackFromEditor = () => {
    setEditingId(null)
    if (justCreatedId) {
      setSyncPromptId(justCreatedId)
      setJustCreatedId(null)
    }
  }

  const handleDeleteFromList = (id) => {
    deleteLog(id)
    if (id === syncPromptId) setSyncPromptId(null)
  }

  const handleSyncNow = async () => {
    if (!syncCode) return
    setSyncError('')
    setSyncBusy(true)
    try {
      const deviceId = ensureDeviceId()
      await pushLogs(syncCode, logs, deviceId)
      markSynced(syncCode)
    } catch (e) {
      setSyncError(e.status === 403
        ? 'This device no longer owns this code — ownership was transferred to another device.'
        : e.message)
    } finally {
      setSyncBusy(false)
    }
  }

  const handleImport = async (code) => {
    const deviceId = ensureDeviceId()
    const restored = await claimAndRestore(code, deviceId)
    replaceLogs(restored)
    markSynced(code)
  }

  const actions = { updateLog, deleteLog, addAircraft, removeAircraft, updateAircraft, addSector, removeSector, updateSector, addCrew, updateCrew, removeCrew }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      {editing ? (
        <LogEditor
          log={editing}
          actions={actions}
          onBack={handleBackFromEditor}
          onDelete={(id) => { deleteLog(id); setEditingId(null) }}
        />
      ) : (
        <LogList
          logs={logs}
          onNew={handleNew}
          onOpen={setEditingId}
          onDelete={handleDeleteFromList}
          syncCode={syncCode}
          lastSyncedAt={lastSyncedAt}
          onSyncNow={handleSyncNow}
          syncBusy={syncBusy}
          syncError={syncError}
          syncPromptId={syncPromptId}
          onDismissSyncPrompt={() => setSyncPromptId(null)}
          onOpenSettings={onOpenSettings}
          onView={viewLogs}
          onImport={handleImport}
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
  const ensureDeviceId = useDutyLogStore(s => s.ensureDeviceId)

  const [copied, setCopied] = useState(false)
  const [restoreCode, setRestoreCode] = useState('')
  const [confirmRestore, setConfirmRestore] = useState(false)
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
      const deviceId = ensureDeviceId()
      await pushLogs(code, logs, deviceId)
      markSynced(code)
    } catch (e) {
      setError(e.status === 403
        ? 'This device no longer owns this code — ownership was transferred to another device.'
        : e.message)
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
    if (!confirmRestore) { setConfirmRestore(true); return }
    setError('')
    setBusy('restore')
    try {
      const deviceId = ensureDeviceId()
      const restored = await claimAndRestore(code, deviceId)
      replaceLogs(restored)
      markSynced(code)
      setRestoreCode('')
      setConfirmRestore(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const handleScanResult = (data) => {
    setScanning(false)
    setRestoreCode(data)
    setConfirmRestore(false)
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
            {syncCode ? (relTime ? `LAST SYNCED · ${relTime}` : 'CLOUD SYNC READY') : 'NO CLOUD SYNC CODE DETECTED FOR THIS DEVICE'}
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

      {syncCode ? (
        <div style={{ marginBottom: 18 }}>
          {qrDataUrl && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <img src={qrDataUrl} alt="Sync code QR" style={{ width: 160, height: 160, borderRadius: 6 }} />
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
            Code &amp; QR stay visible here any time — e.g. to set up a second device. Only this device can push updates while it owns this code.
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 18 }}>
          <div style={{
            fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.06em',
            lineHeight: 1.6, marginBottom: 10,
          }}>
            Create a cloud sync code to copy your logs to the cloud, then enter it on another device to load them there.
          </div>
          <button
            onClick={runBackup}
            disabled={busy === 'backup'}
            className="cp-btn"
            style={{ width: '100%', padding: '8px 10px' }}
          >{busy === 'backup' ? 'CREATING…' : 'CREATE CLOUD SYNC CODE'}</button>
        </div>
      )}

      <div className="cp-divider" style={{ margin: '16px 0' }} />

      <div className="cp-label" style={{ marginBottom: 6 }}>Restore from a code</div>
      <div style={{
        fontFamily: mono, fontSize: 8, color: 'var(--cp-dim)', letterSpacing: '0.04em',
        lineHeight: 1.5, marginBottom: 8,
      }}>
        Replaces logs on this device and makes this device the owner of the code. The previous owner device will stop being able to push until it links a new code.
      </div>
      <button
        onClick={() => setScanning(true)}
        disabled={busy === 'restore'}
        className="cp-btn"
        style={{ width: '100%', padding: '8px 10px', marginBottom: 10 }}
      >TAP TO SCAN</button>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={restoreCode}
          onChange={(e) => { setRestoreCode(e.target.value); setConfirmRestore(false) }}
          placeholder="XXXX-XXXX-XXXX"
          className="cp-input"
          style={{ flex: 1 }}
        />
        <button
          onClick={() => runRestore(restoreCode)}
          disabled={busy === 'restore' || !restoreCode.trim()}
          className="cp-btn-danger cp-btn"
          style={{ padding: '8px 10px' }}
        >{busy === 'restore' ? 'RESTORING…' : (confirmRestore ? 'CONFIRM' : 'RESTORE')}</button>
      </div>
      {confirmRestore && (
        <div style={{ fontFamily: mono, fontSize: 8, color: 'var(--cp-red)', letterSpacing: '0.04em', marginTop: 6, lineHeight: 1.5 }}>
          This overwrites all logs on this device. Tap CONFIRM to proceed.
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
