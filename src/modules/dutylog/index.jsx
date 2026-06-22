import { useEffect } from 'react'
import useDutyLogStore from './store/dutylogStore'
import LogList from './pages/LogList'
import LogEditor from './pages/LogEditor'

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
