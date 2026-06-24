import { useEffect, useState } from 'react'
import useDutyLogStore from './store/dutylogStore'
import LogList from './pages/LogList'
import LogEditor from './pages/LogEditor'
import { generateSyncCode, pushLogs, pullLogs } from './services/sync'

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
  const setSyncCode = useDutyLogStore(s => s.setSyncCode)
  const replaceLogs = useDutyLogStore(s => s.replaceLogs)

  const [copied, setCopied] = useState(false)
  const [restoreCode, setRestoreCode] = useState('')
  const [busy, setBusy] = useState(null) // null | 'backup' | 'restore'
  const [error, setError] = useState('')

  const handleBackup = async () => {
    setError('')
    setBusy('backup')
    try {
      const code = syncCode || generateSyncCode()
      await pushLogs(code, logs)
      setSyncCode(code)
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

  const handleRestore = async () => {
    const code = restoreCode.trim().toUpperCase()
    if (!code) return
    if (!window.confirm('Restoring will replace all logs currently on this device. Continue?')) return
    setError('')
    setBusy('restore')
    try {
      const restored = await pullLogs(code)
      replaceLogs(restored)
      setSyncCode(code)
      setRestoreCode('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="cp-label" style={{ marginBottom: 6 }}>Your backup code</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <div style={{
          flex: 1, fontFamily: mono, fontSize: 13, letterSpacing: '0.1em',
          color: syncCode ? 'var(--cp-acc)' : 'var(--cp-dim)', background: 'var(--cp-bg3)',
          border: '1px solid var(--cp-border)', borderRadius: 4, padding: '8px 10px',
        }}>{syncCode || 'NO BACKUP YET'}</div>
        <button
          onClick={handleCopy}
          disabled={!syncCode}
          className="cp-btn"
          style={{ padding: '8px 10px', opacity: syncCode ? 1 : 0.4 }}
        >{copied ? 'COPIED' : 'COPY'}</button>
      </div>
      <button
        onClick={handleBackup}
        disabled={busy === 'backup'}
        className="cp-btn"
        style={{ width: '100%', padding: '8px 10px', marginBottom: 8 }}
      >{busy === 'backup' ? 'BACKING UP…' : syncCode ? 'SYNC NOW' : 'BACKUP NOW'}</button>
      <div style={{
        fontFamily: mono, fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.06em',
        lineHeight: 1.6, marginBottom: 14,
      }}>
        Save this code somewhere safe. Anyone with this code can view or restore these logs.
      </div>

      <div className="cp-divider" style={{ margin: '14px 0' }} />

      <div className="cp-label" style={{ marginBottom: 6 }}>Restore from a code</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={restoreCode}
          onChange={(e) => setRestoreCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          className="cp-input"
          style={{ flex: 1 }}
        />
        <button
          onClick={handleRestore}
          disabled={busy === 'restore' || !restoreCode.trim()}
          className="cp-btn"
          style={{ padding: '8px 10px' }}
        >{busy === 'restore' ? 'RESTORING…' : 'RESTORE'}</button>
      </div>

      {error && (
        <div style={{
          fontFamily: mono, fontSize: 9, color: 'var(--cp-red)', letterSpacing: '0.06em',
          lineHeight: 1.6, marginTop: 10,
        }}>{error}</div>
      )}
    </div>
  )
}
