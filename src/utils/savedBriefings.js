// Pure helpers for the Saved Briefings list (calculatorStore.js) — a capped,
// manually-managed list of named briefing snapshots, distinct from a
// module's own 12h-expiring cache.

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
