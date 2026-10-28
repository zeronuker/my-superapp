const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]

// Extra searchable text for an ISO date (YYYY-MM-DD), e.g. "18 SEP 2026 SEPTEMBER 2026" —
// lets a query like "sep" or "18 sep" hit a date that is stored as plain ISO.
export function altDateText(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m) return ''
  const monFull = MONTH_NAMES[m - 1] || ''
  return `${String(d).padStart(2, '0')} ${monFull.slice(0, 3)} ${y} ${monFull} ${y}`
}
