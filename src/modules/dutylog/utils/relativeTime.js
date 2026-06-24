// Coarse relative-time label for the Backup & Sync status card, e.g. "2 MIN AGO".
export function relativeTimeFromNow(ts, now = Date.now()) {
  if (!ts) return null
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000))
  if (diffSec < 30) return 'JUST NOW'
  if (diffSec < 60) return `${diffSec} SEC AGO`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} MIN AGO`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} HR${diffHr === 1 ? '' : 'S'} AGO`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay} DAY${diffDay === 1 ? '' : 'S'} AGO`
}
