const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]

// Extra searchable text for a date when "match month names" is on, e.g.
// "18 SEP 2026 SEPTEMBER 2026" — lets a query like "sep" or "18 sep" hit a
// date stored as plain ISO (YYYY-MM-DD) internally.
export function altDateText(log) {
  if (!log.date) return ''
  const [y, m, d] = log.date.split('-').map(Number)
  if (!y || !m) return ''
  const monFull = MONTH_NAMES[m - 1] || ''
  return `${String(d).padStart(2, '0')} ${monFull.slice(0, 3)} ${y} ${monFull} ${y}`
}

// Returns the name of the first field in `log` containing `query`
// (case-insensitive), or null. Field order doubles as match priority.
export function matchField(log, query, monthMode) {
  const q = query.toLowerCase()
  if (!q) return null
  const dateHay = log.date + (monthMode ? ' ' + altDateText(log) : '')
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
