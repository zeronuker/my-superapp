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

function blankAircraft() {
  return { id: uid(), reg: '', type: '', mtow: '', mlw: '', config: '', dow: '', doi: '' }
}

function blankCrew() {
  return { id: uid(), name: '', position: '' }
}

function blankLog() {
  const now = Date.now()
  return {
    id: uid(),
    date: '',
    aircraft: [blankAircraft()],
    sectors: [blankSector()],
    notes: '',
    crew: [blankCrew(), blankCrew(), blankCrew(), blankCrew()],
    createdAt: now,
    updatedAt: now,
  }
}

function mapLog(logs, id, fn) {
  return logs.map(l => (l.id === id ? { ...fn(l), updatedAt: Date.now() } : l))
}

const useDutyLogStore = create(persist(
  (set, get) => ({
    logs: [],
    editingId: null,
    syncCode: null,
    lastSyncedAt: null,
    deviceId: null,

    setEditingId: (id) => set({ editingId: id }),

    clearAll: () => set({ logs: [], editingId: null }),

    markSynced: (code) => set({ syncCode: code, lastSyncedAt: Date.now() }),

    replaceLogs: (logs) => set({ logs }),

    // Lazily generates and persists a per-device id, used to claim/verify
    // ownership of a sync code without any account system.
    ensureDeviceId: () => {
      const existing = get().deviceId
      if (existing) return existing
      const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : uid()
      set({ deviceId: id })
      return id
    },

    createLog: () => {
      const log = blankLog()
      set((s) => ({ logs: [log, ...s.logs] }))
      return log.id
    },

    updateLog: (id, patch) =>
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({ ...l, ...patch })) })),

    deleteLog: (id) =>
      set((s) => ({ logs: s.logs.filter(l => l.id !== id) })),

    // ── Aircraft ──────────────────────────────────────────────────────────
    addAircraft: (id) =>
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({
        ...l,
        aircraft: l.aircraft.length < 2 ? [...l.aircraft, blankAircraft()] : l.aircraft,
      })) })),

    removeAircraft: (id, aid) =>
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({
        ...l,
        aircraft: l.aircraft.length > 1 ? l.aircraft.filter(a => a.id !== aid) : l.aircraft,
      })) })),

    updateAircraft: (id, aid, patch) =>
      set((s) => ({ logs: mapLog(s.logs, id, (l) => ({
        ...l,
        aircraft: l.aircraft.map(a => (a.id === aid ? { ...a, ...patch } : a)),
      })) })),

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
    version: 2,
    migrate: (state, version) => {
      let s = state
      if (version === 0) {
        s = {
          ...s,
          logs: (s.logs ?? []).map(log => ({
            ...log,
            crew: (log.crew ?? []).map(c => (c.id ? c : { ...c, id: uid() })),
          })),
        }
      }
      if (version < 2) {
        s = {
          ...s,
          logs: (s.logs ?? []).map(log => {
            if (log.aircraft) return log
            const { reg, type, mtow, mlw, config, dow, doi, ...rest } = log
            return {
              ...rest,
              aircraft: [{ id: uid(), reg: reg||'', type: type||'', mtow: mtow||'', mlw: mlw||'', config: config||'', dow: dow||'', doi: doi||'' }],
            }
          }),
        }
      }
      return s
    },
  }
))

export default useDutyLogStore
