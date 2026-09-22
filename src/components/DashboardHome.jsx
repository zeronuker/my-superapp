import React from 'react'
import usePrayerStore from '../modules/prayer/store/prayerStore'
import { METAR_CACHE_KEY } from '../utils/moduleCacheKeys'

// ── Dashboard Home ──────────────────────────────────────────────────────────
export default function DashboardHome({ onSelect, widgets = { utc: true, prayer: true, metar: true } }) {
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const prayerTimes = usePrayerStore(s => s.prayerTimes)

  const utcStr  = new Date(now).toISOString().slice(11, 19) + 'Z'
  const utcDate = new Date(now).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  })

  // METAR status — read last fetch age from cache
  const metarAge = React.useMemo(() => {
    try {
      const c = JSON.parse(localStorage.getItem(METAR_CACHE_KEY))
      if (!c?.fetchedAt) return null
      const min = Math.floor((now - c.fetchedAt) / 60000)
      if (min < 1)  return 'LIVE'
      if (min < 60) return `${min}M AGO`
      const h = Math.floor(min / 60)
      return `${h}H AGO`
    } catch { return null }
  }, [now])

  const metarRoute = React.useMemo(() => {
    try {
      const c = JSON.parse(localStorage.getItem(METAR_CACHE_KEY))
      const parts = [c?.dep, c?.arr].filter(Boolean)
      return parts.length ? parts.join('→') : null
    } catch { return null }
  }, [now])

  // Prayer — next prayer from live in-memory store (avoids raw localStorage parsing)
  const nextPrayer = React.useMemo(() => {
    try {
      const times = prayerTimes
      if (!times || typeof times !== 'object') return null
      const nowMs = now
      const PRAYERS = [
        { label: 'Fajr',    key: 'fajrDate' },
        { label: 'Dhuhr',   key: 'dhuhrDate' },
        { label: 'Asr',     key: 'asrDate' },
        { label: 'Maghrib', key: 'maghribDate' },
        { label: 'Isha',    key: 'ishaDate' },
      ]
      const upcoming = PRAYERS
        .map(p => ({ label: p.label, t: new Date(times[p.key]).getTime() }))
        .filter(p => !isNaN(p.t) && p.t > nowMs)
      let first
      if (!upcoming.length) {
        // All prayers passed — show next day's Fajr
        const fajrMs = new Date(times.fajrDate).getTime()
        if (isNaN(fajrMs)) return null
        first = { label: 'Fajr', t: fajrMs + 86_400_000 }
      } else {
        first = upcoming[0]
      }
      const diff = first.t - nowMs
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      const countdown = h > 0 ? `${h}H ${m}M ${s}S` : m > 0 ? `${m}M ${s}S` : `${s}S`
      return { label: first.label.toUpperCase(), countdown }
    } catch { return null }
  }, [now, prayerTimes])

  const W = {
    border: '1px solid var(--cp-border2)',
    borderTop: '2px solid var(--cp-acc)',
    borderRadius: 6, padding: '14px 16px', flex: 1, minWidth: 0,
    cursor: 'pointer', transition: 'border-color 0.12s, background 0.12s',
  }

  const showUtc    = widgets.utc !== false
  const showPrayer = widgets.prayer !== false && nextPrayer
  const showMetar  = widgets.metar !== false && metarAge
  if (!showUtc && !showPrayer && !showMetar) return null

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>

        {/* UTC clock */}
        {showUtc && (
        <div className="cp-launch-card" style={W} onClick={() => onSelect('worldtime')}>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.18em',
            color: 'var(--cp-dim)', marginBottom: 6 }}>UTC / ZULU</div>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 22, fontWeight: 700,
            color: 'var(--cp-acc)', letterSpacing: '0.04em', lineHeight: 1,
            fontVariantNumeric: 'tabular-nums' }}>{utcStr}</div>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)',
            letterSpacing: '0.06em', marginTop: 5 }}>{utcDate}</div>
        </div>
        )}

        {/* Next prayer */}
        {showPrayer && (
          <div className="cp-launch-card" style={W} onClick={() => onSelect('prayer')}>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.18em',
              color: 'var(--cp-dim)', marginBottom: 6 }}>NEXT PRAYER</div>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 16, fontWeight: 700,
              color: 'var(--cp-acc)', letterSpacing: '0.04em', lineHeight: 1,
              fontVariantNumeric: 'tabular-nums' }}>{nextPrayer.countdown}</div>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)',
              letterSpacing: '0.1em', marginTop: 5 }}>{nextPrayer.label}</div>
          </div>
        )}

        {/* METAR status */}
        {showMetar && (
          <div className="cp-launch-card" style={W} onClick={() => onSelect('metartaf')}>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.18em',
              color: 'var(--cp-dim)', marginBottom: 6 }}>METAR</div>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 22, fontWeight: 700,
              color: metarAge === 'LIVE' ? 'var(--cp-green)' : 'var(--cp-acc)',
              letterSpacing: '0.04em', lineHeight: 1 }}>{metarAge}</div>
            {metarRoute && (
              <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)',
                letterSpacing: '0.1em', marginTop: 5 }}>{metarRoute}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
