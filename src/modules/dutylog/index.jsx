/**
 * Flight Duty Log module — drop into any tab in the parent app.
 * Self-contained: own persisted store, no parent store dependencies.
 * Offline-first — all data lives in localStorage via zustand persist.
 */
import { useState } from 'react'
import useDutyLogStore from './store/dutylogStore'
import LogList from './pages/LogList'
import LogEditor from './pages/LogEditor'

export default function DutyLogModule() {
  const {
    logs, createLog, updateLog, deleteLog,
    addSector, removeSector, updateSector,
    addCrew, updateCrew, removeCrew,
  } = useDutyLogStore()

  const [editingId, setEditingId] = useState(null)
  const editing = logs.find(l => l.id === editingId)

  const actions = { updateLog, deleteLog, addSector, removeSector, updateSector, addCrew, updateCrew, removeCrew }

  // Guard: if the edited log vanishes (deleted elsewhere), fall back to the list.
  if (editingId && !editing) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <LogList logs={logs} onNew={() => setEditingId(createLog())} onOpen={setEditingId} onDelete={deleteLog} />
      </div>
    )
  }

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
