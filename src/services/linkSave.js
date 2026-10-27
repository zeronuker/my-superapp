// Writes duty log ↔ saved briefing links to both sides, on this device: the sector keeps `briefingLink`,
// the saved briefing keeps `dutyLink`. Links are made by hand only.

import useDutyLogStore from '../modules/dutylog/store/dutylogStore'
import { useCalculatorStore } from '../store/calculatorStore'
import { resolveLinks } from '../utils/briefingLink'

const stores = () => ({ duty: useDutyLogStore.getState(), calc: useCalculatorStore.getState() })
const resolve = ({ duty, calc }) => resolveLinks(duty.logs, calc.briefing.saves)

// Links a sector and a briefing. What either had before gives way.
export function writeLink(logId, sectorId, saveId) {
  const s = stores(), links = resolve(s)
  const taken = links.bySave.get(saveId)
  if (taken && taken.sectorId !== sectorId) s.duty.updateSector(taken.logId, taken.sectorId, { briefingLink: '' })
  const prev = links.bySector.get(sectorId)
  if (prev && prev.saveId !== saveId) s.calc.setSavedBriefingLink(prev.saveId, null)
  s.duty.updateSector(logId, sectorId, { briefingLink: saveId })
  s.calc.setSavedBriefingLink(saveId, { logId, sectorId })
}

// Unlinks a sector from its briefing.
export function clearLink(logId, sectorId) {
  const s = stores(), prev = resolve(s).bySector.get(sectorId)
  s.duty.updateSector(logId, sectorId, { briefingLink: '' })
  if (prev) s.calc.setSavedBriefingLink(prev.saveId, null)
}

// A log as it is now, with its links and every sector's link in the app, to put back with restoreSnapshot.
export function takeSnapshot(logId) {
  const s = stores(), links = resolve(s)
  const log = s.duty.logs.find(l => l.id === logId)
  return {
    log: structuredClone(log),
    links: log.sectors.filter(x => links.bySector.has(x.id)).map(x => ({ sectorId: x.id, ...links.bySector.get(x.id) })),
    sectors: Object.fromEntries(s.duty.logs.flatMap(l => l.sectors).map(x => [x.id, x.briefingLink])),
    copies: Object.fromEntries(s.calc.briefing.saves.map(b => [b.id, b.dutyLink])),
  }
}

// The log, the other logs' links and the briefings' copies back as they were when the snapshot was taken.
export function restoreSnapshot(snap) {
  const s = stores()
  s.duty.updateLog(snap.log.id, snap.log)
  for (const log of s.duty.logs) {
    if (log.id === snap.log.id) continue
    for (const x of log.sectors) {
      if (x.id in snap.sectors && snap.sectors[x.id] !== x.briefingLink) s.duty.updateSector(log.id, x.id, { briefingLink: snap.sectors[x.id] })
    }
  }
  for (const b of s.calc.briefing.saves) {
    const was = snap.copies[b.id] ?? null
    if (JSON.stringify(b.dutyLink ?? null) !== JSON.stringify(was)) s.calc.setSavedBriefingLink(b.id, was)
  }
}
