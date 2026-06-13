import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Stable id for logs / sectors so list renumbering is purely positional.
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

function blankLog() {
  const now = Date.now()
  return {
    id: uid(),
    date: '', reg: '', type: '', mtow: '', mlw: '', config: '', dow: '', doi: '',
    sectors: [blankSector()],
    notes: '',
    crew: [{ name: '', position: '' }, { name: '', position: '' }],
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
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({ ...l, crew: [...l.crew, { name: '', position: '' }] })) })),

    updateCrew: (id, idx, patch) =>
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({
        ...l,
        crew: l.crew.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
      })) })),

    removeCrew: (id, idx) =>
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({ ...l, crew: l.crew.filter((_, i) => i !== idx) })) })),
  }),
  { name: 'dutylog-module-store' }   // scoped localStorage key — never collides with parent
))

export default useDutyLogStore
