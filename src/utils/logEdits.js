// What changed in a duty log between two copies of it. Pure — no React, no stores.
// The link field and the save stamp are ignored: linking is not an edit of the log.

const canon = (v) => (Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, canon(v[k])]))
    : v)
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))

const plainSector = ({ briefingLink, ...rest }) => rest
const LABELS = { date: 'the date', aircraft: 'the aircraft', crew: 'the crew', notes: 'the notes' }

// { sectorIds: sectors whose own fields changed, other: what changed outside the sectors, by name }.
// Adding, removing or reordering sectors counts as outside them.
export function editedParts(before, after) {
  const was = new Map(before.sectors.map(s => [s.id, s]))
  const sectorIds = after.sectors.filter(s => was.has(s.id) && !same(plainSector(s), plainSector(was.get(s.id)))).map(s => s.id)
  const other = Object.keys({ ...before, ...after })
    .filter(k => k !== 'sectors' && k !== 'updatedAt' && !same(before[k], after[k]))
    .map(k => LABELS[k] ?? `the ${k}`)
  if (!same(before.sectors.map(s => s.id), after.sectors.map(s => s.id))) other.push('the sectors')
  return { sectorIds, other }
}

// Which of the links a log had when opened to ask about on leaving: the sectors it edited, or all of
// them when it edited anything outside the sectors. Left out: a sector that is gone, or unlinked or
// linked to another briefing since (the pilot already chose). baseline: [{ sectorId, saveId }],
// now: Map(sectorId → { saveId }).
export function linksToAsk(before, after, baseline, now) {
  const { sectorIds, other } = editedParts(before, after)
  const present = new Set(after.sectors.map(s => s.id))
  return baseline.filter(l => {
    if (!present.has(l.sectorId) || now.get(l.sectorId)?.saveId !== l.saveId) return false
    return other.length > 0 || sectorIds.includes(l.sectorId)
  })
}
