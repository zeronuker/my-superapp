// Pure helpers for the Enroute Alternates fields on the METAR/TAF, NOTAM and
// SIGMET tabs. The state stays `count` (how many fields are showing) plus a
// fixed-length `alts` array; the fields that show are alts[0 .. count-1].

/** Add one empty field. There is no limit unless a `max` is given; the array grows when it is full. */
export function addEnroute(count, alts, max = Infinity) {
  if (count >= max) return { count, alts }
  const length = Math.max(alts.length, count + 1)
  return { count: count + 1, alts: Array.from({ length }, (_, i) => (i === count ? '' : alts[i] ?? '')) }
}

/** An `alts` array to keep as state: the given codes, padded with empty slots to at least `min` (never cut short). */
export function padEnroute(alts, min = 5) {
  return Array.from({ length: Math.max(min, alts?.length ?? 0) }, (_, i) => alts?.[i] || '')
}

/** Remove the field at `index`; the ones after it move up. No-op if it isn't a showing field. */
export function removeEnroute(count, alts, index) {
  if (!Number.isInteger(index) || index < 0 || index >= count) return { count, alts }
  const kept = alts.slice(0, count).filter((_, i) => i !== index)
  return { count: kept.length, alts: [...kept, ...Array(Math.max(0, alts.length - kept.length)).fill('')] }
}

/** The alternates actually entered, in order. An empty field and no field count the same. */
export function activeEnroute(count, alts) {
  return (alts ?? []).slice(0, count || 0).map(a => String(a ?? '').trim().toUpperCase()).filter(Boolean)
}
