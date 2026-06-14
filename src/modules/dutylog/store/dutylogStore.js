import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function blankSector() {
  return {
    id: uid(),
    fltNo: '', from: '', dest: '', pax: '',
    fuelOff: '', fuelOn: '',
    offBlk: '', takeoff: '', ldg: '', onBlk: '',
    engN1: '', engAlt: '', engIas: '',
    remark: '',
  }
}

function blankCrew() {
  return { id: uid(), name: '', position: '' }
}

function blankLog() {
  const now = Date.now()
  return {
    id: uid(),
    date: '', reg: '', type: '', mtow: '', mlw: '', config: '', dow: '', doi: '',
    sectors: [blankSector()],
    notes: '',
    crew: [blankCrew(), blankCrew()],
    createdAt: now,
    updatedAt: now,
  }
}

// Replace the matching log via an updater, stamping updatedAt.
function mapLog(logs, id, fn) {
  return logs.map(l => (l.id === id ? { ...fn(l), updatedAt: Date.now() } : l))
}

const useDutyLogStore = create(persist(
  (set) => ({
    logs: [],
    editingId: null,

    setEditingId: (id) => set({ editingId: id }),

    clearAll: () => set({ logs: [], editingId: null }),

    // Returns the new id so the caller can open it straight away.
    createLog: () => {
      const log = blankLog()
      set((s) => ({ logs: [log, ...s.logs] }))
      return log.id
    },

    updateLog: (id, patch) =>
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({ ...l, ...patch })) })),

    deleteLog: (id) =>
      set((s) => ({ logs: s.logs.filter(l => l.id !== id) })),

    // ── Sectors ───────────────────────────────────────────────────────────
    addSector: (id) =>
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({ ...l, sectors: [...l.sectors, blankSector()] })) })),

    removeSector: (id, sid) =>
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({
        ...l,
        sectors: l.sectors.length > 1 ? l.sectors.filter(x => x.id !== sid) : l.sectors,
      })) })),

    updateSector: (id, sid, patch) =>
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({
        ...l,
        sectors: l.sectors.map(x => (x.id === sid ? { ...x, ...patch } : x)),
      })) })),

    // ── Crew ──────────────────────────────────────────────────────────────
    addCrew: (id) =>
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({ ...l, crew: [...l.crew, blankCrew()] })) })),

    // cid = crew entry's stable id (not array index)
    updateCrew: (id, cid, patch) =>
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({
        ...l,
        crew: l.crew.map((c) => (c.id === cid ? { ...c, ...patch } : c)),
      })) })),

    removeCrew: (id, cid) =>
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({ ...l, crew: l.crew.filter((c) => c.id !== cid) })) })),
  }),
  {
    name: 'dutylog-module-store',
    version: 1,
    // v0 → v1: add stable id to crew entries that predate this field.
    migrate: (state, version) => {
      if (version === 0) {
        return {
          ...state,
          logs: (state.logs ?? []).map(log => ({
            ...log,
            crew: (log.crew ?? []).map(c => (c.id ? c : { ...c, id: uid() })),
          })),
        }
      }
      return state
    },
  }
))

export default useDutyLogStore
