import { altDateText } from '../../../utils/dateSearch'

// Returns the name of the first field in `log` containing `query`
// (case-insensitive), or null. Field order doubles as match priority.
// The date matches as ISO (2026-09-18) and as text ("sep", "18 sep").
export function matchField(log, query) {
  const q = query.toLowerCase()
  if (!q) return null
  const dateHay = `${log.date} ${altDateText(log.date)}`
  if (dateHay.toLowerCase().includes(q)) return 'date'
  for (const s of log.sectors || []) {
    if ((s.from || '').toLowerCase().includes(q) || (s.dest || '').toLowerCase().includes(q)) return 'route'
    if ((s.fltNo || '').toLowerCase().includes(q)) return 'flight no'
    if ((s.remark || '').toLowerCase().includes(q)) return 'remark'
  }
  for (const a of log.aircraft || []) {
    if ((a.reg || '').toLowerCase().includes(q)) return 'reg'
    if ((a.type || '').toLowerCase().includes(q)) return 'aircraft type'
  }
  for (const c of log.crew || []) {
    if ((c.name || '').toLowerCase().includes(q)) return 'crew'
  }
  if ((log.notes || '').toLowerCase().includes(q)) return 'notes'
  return null
}
