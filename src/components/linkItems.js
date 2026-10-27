import { savedRowInfo, formatSnapshotStamp } from '../utils/savedBriefings'

// Rows for LinkPicker. Each takes a ranked entry from utils/briefingLink.js and, when that briefing or
// sector is already linked somewhere else, a short name for where (`takenBy`).

const join = (...parts) => parts.filter(Boolean).join(' · ')
const route = (dep, arr) => (dep && arr ? `${dep} → ${arr}` : dep || arr || '—')

export const briefingName = (save) => {
  const r = savedRowInfo(save)
  return join(r.flight, route(save.route?.dep, save.route?.arr))
}

export const sectorName = (log, sector) => `${log.date || 'UNDATED'} #${log.sectors.indexOf(sector) + 1}`

// Where a link points: the {logId, sectorId} resolveLinks gives for a briefing.
export function linkedSectorName(logs, { logId, sectorId }) {
  const log = logs.find(l => l.id === logId)
  const sector = log?.sectors.find(s => s.id === sectorId)
  return log && sector ? sectorName(log, sector) : ''
}

export function briefingItem({ save, auto, near }, takenBy) {
  const r = savedRowInfo(save)
  return {
    key: save.id, near, best: auto, takenBy,
    title: briefingName(save),
    sub: r.isOfp ? join(r.stdDate, r.std && `STD ${r.std}Z`, r.tail) : `saved ${formatSnapshotStamp(save.savedAt)}`,
    tags: [{ text: r.isOfp ? 'OFP' : 'MANUAL', kind: r.isOfp ? 'ofp' : 'manual' }],
    search: [save.name, r.flight, save.route?.dep, save.route?.arr, r.tail, r.ofpNo].filter(Boolean).join(' ').toLowerCase(),
  }
}

export function sectorItem({ log, sector, auto, near }, takenBy) {
  const reg = ((log.aircraft || []).find(a => a.id === sector.aircraftId) ?? log.aircraft?.[0])?.reg
  return {
    key: sector.id, near, best: auto, takenBy,
    title: `${sectorName(log, sector)} · ${sector.fltNo || '—'}`,
    sub: join(route(sector.from, sector.dest), reg, sector.offBlk && `off block ${sector.offBlk}`),
    tags: [],
    search: [log.date, sector.fltNo, sector.from, sector.dest, reg].filter(Boolean).join(' ').toLowerCase(),
  }
}
