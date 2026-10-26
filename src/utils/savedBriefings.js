// Pure helpers for the Saved Briefings list (calculatorStore.js) — a capped,
// manually-managed list of named briefing snapshots, distinct from a
// module's own 12h-expiring cache.

import { utcParts } from './ofpTimes'

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function makeBriefingId() { return uid() }

// "WMKK → WSSS · 15 Sep 14:20" — falls back to whichever of dep/arr exists.
// Uses UTC (this app's convention for aviation timestamps elsewhere).
export function autoBriefingName(route, timestamp = Date.now()) {
  const dep = (route?.dep || '').trim()
  const arr = (route?.arr || '').trim()
  const routePart = dep && arr ? `${dep} → ${arr}` : (dep || arr || 'Briefing')
  const d = new Date(timestamp)
  const day = d.getUTCDate()
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${routePart} · ${day} ${month} ${hh}:${mm}`
}

// "15 Sep 14:20Z" — UTC, for the "Saved snapshot · data as of …" line shown on
// a saved briefing. Empty string when there is no usable timestamp.
export function formatSnapshotStamp(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return ''
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${d.getUTCDate()} ${month} ${hh}:${mm}Z`
}

// What one row of the Saved Briefings list shows. An OFP save carries route.flightDetails
// (flight + info: tail, type, ofpNo, std, sta); a manual save only has the route. customName is
// null while the name is still the auto one, since the row already shows that information.
export function savedRowInfo(save) {
  const { route, savedAt, name } = save
  const fd = route?.flightDetails
  const info = fd?.info
  const std = info?.std ? utcParts(info.std) : null
  const sta = info?.sta ? utcParts(info.sta) : null
  return {
    isOfp: !!fd,
    customName: name && name !== autoBriefingName(route, savedAt) ? name : null,
    flight: fd?.flight || null,
    tail: info?.tail || null,
    type: info?.type || null,
    ofpNo: info?.ofpNo || null,
    std: std?.time || null,
    sta: sta?.time || null,
    stdDate: std ? formatSnapshotStamp(Date.parse(info.std)).split(' ').slice(0, 2).join(' ') : null,
  }
}

// savedRowInfo plus the route and save time: everything a list row shows, as small plain values.
// The cloud keeps this beside each briefing so the VIEW list can draw rows without downloading them.
export function briefingRow(save) {
  return { ...savedRowInfo(save), dep: save.route?.dep ?? null, arr: save.route?.arr ?? null, savedAt: save.savedAt }
}

// Search over what a row shows (custom name, flight, dep/arr, tail, type, OFP number, OFP/MANUAL tag).
// Case-insensitive; every space-separated word must match, so "mh2623 wsss" narrows the list.
export function filterSaves(saves, query) {
  const terms = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return saves
  return saves.filter(s => {
    const r = savedRowInfo(s)
    const text = [r.customName, r.flight, s.route?.dep, s.route?.arr, r.tail, r.type, r.ofpNo, r.isOfp ? 'OFP' : 'MANUAL']
      .filter(Boolean).join(' ').toLowerCase()
    return terms.every(t => text.includes(t))
  })
}

export function sortByNewest(list) {
  return [...list].sort((a, b) => b.savedAt - a.savedAt)
}

export function findOldest(list) {
  if (!list.length) return null
  return list.reduce((oldest, cur) => (cur.savedAt < oldest.savedAt ? cur : oldest))
}

export function isAtCap(list, cap) {
  return list.length >= cap
}

// Given a newest-first sorted list and the id being removed, returns the id
// that should become the open entry next — the one after it in display
// order, or the new last entry if the removed one was last. Null once
// nothing is left.
export function pickNextAfterDelete(sortedList, deletedId) {
  const idx = sortedList.findIndex(b => b.id === deletedId)
  if (idx === -1) return null
  if (sortedList.length - 1 <= 0) return null
  if (idx < sortedList.length - 1) return sortedList[idx + 1].id
  return sortedList[idx - 1].id
}
