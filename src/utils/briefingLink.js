// Links duty log sectors to saved briefings. Pure — no React, no stores.
//
// Links are made by hand only. A sector's `briefingLink` is a saved briefing's id, or empty/missing when
// unlinked; the briefing keeps its own copy (`dutyLink`, see services/linkSave.js). A link stays until it
// is changed or unlinked, whatever the log says later. One briefing belongs to one sector, one sector has
// at most one briefing; a log with several sectors can have several. The pickers below only rank the
// choices — a best guess is a suggestion, never a link.

const DAY_MS = 86400000

const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
// The trailing digits of a flight number: MH2623, "mh 2623" and the callsign MXD2623 all give 2623.
const flightDigits = (s) => /(\d+)$/.exec(norm(s))?.[1] ?? ''

const logDay = (log) => (/^\d{4}-\d{2}-\d{2}$/.test(log.date ?? '') ? Math.floor(Date.parse(`${log.date}T00:00:00Z`) / DAY_MS) : null)
// The day a briefing is about: the OFP's STD (UTC); a manual briefing only has its save time.
const saveDay = (save) => {
  const ms = Date.parse(save.route?.flightDetails?.info?.std ?? '') || save.savedAt
  return Number.isFinite(ms) ? Math.floor(ms / DAY_MS) : null
}
const isOfp = (save) => !!save.route?.flightDetails?.info?.std

function sectorReg(log, sector) {
  const list = log.aircraft || []
  return (list.find(a => a.id === sector.aircraftId) ?? list[0])?.reg
}

// How well a sector fits a briefing. `auto` = a likely fit (the picker's BEST GUESS): an OFP briefing
// within a day of the log date whose flight number matches or whose airports both match.
export function pairScore(log, sector, save) {
  const ld = logDay(log), sd = saveDay(save)
  const dayDiff = ld == null || sd == null ? Infinity : Math.abs(ld - sd)
  const fd = save.route?.flightDetails
  const flight = flightDigits(sector.fltNo) && flightDigits(sector.fltNo) === flightDigits(fd?.flight)
  const from = !!norm(sector.from) && norm(sector.from) === norm(save.route?.dep)
  const dest = !!norm(sector.dest) && norm(sector.dest) === norm(save.route?.arr)
  const tail = !!norm(sectorReg(log, sector)) && norm(sectorReg(log, sector)) === norm(fd?.info?.tail)
  const score = (flight ? 4 : 0) + (from ? 1 : 0) + (dest ? 1 : 0) + (from && dest ? 1 : 0) + (tail ? 1 : 0) + (dayDiff === 0 ? 1 : 0)
  return { score, dayDiff, auto: isOfp(save) && dayDiff <= 1 && (flight || (from && dest)) }
}

// Every link at once, so both screens agree: { bySector: Map(sectorId → {saveId}),
// bySave: Map(saveId → {logId, sectorId}) }. A link to a deleted briefing is ignored, and the first
// sector wins if two claim the same briefing.
export function resolveLinks(logs, saves) {
  const bySector = new Map(), bySave = new Map()
  const known = new Set(saves.map(s => s.id))
  for (const log of logs) for (const sector of log.sectors) {
    const id = sector.briefingLink
    if (!id || !known.has(id) || bySave.has(id)) continue
    bySector.set(sector.id, { saveId: id })
    bySave.set(id, { logId: log.id, sectorId: sector.id })
  }
  return { bySector, bySave }
}

// A log's sectors that have a briefing, for the badge on the Duty Log list.
export const briefingCount = (log, links) => log.sectors.filter(s => links.bySector.has(s.id)).length

// Picker lists: best fit first, then closest date, then newest. `near` = within a week.
const NEAR_DAYS = 7
function ranked(items) {
  return items.sort((a, b) => (b.auto - a.auto) || (b.score - a.score) || (a.dayDiff - b.dayDiff) || (b.stamp - a.stamp))
}

export function rankBriefings(log, sector, saves) {
  return ranked(saves.map(save => ({ save, stamp: save.savedAt, ...pairScore(log, sector, save) })))
    .map(x => ({ ...x, near: x.dayDiff <= NEAR_DAYS }))
}

export function rankSectors(logs, save) {
  const items = []
  for (const log of logs) for (const sector of log.sectors) {
    items.push({ log, sector, stamp: Date.parse(`${log.date}T00:00:00Z`) || 0, ...pairScore(log, sector, save) })
  }
  return ranked(items).map(x => ({ ...x, near: x.dayDiff <= NEAR_DAYS }))
}
