import { useState, useEffect } from 'react'
import { T } from './tokens'

const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']

function getNextPrayer(times) {
  if (!times) return null
  const now = new Date()
  const prayers = [
    { name: 'Fajr',    date: times.fajrDate,    display: times.Fajr    },
    { name: 'Dhuhr',   date: times.dhuhrDate,   display: times.Dhuhr   },
    { name: 'Asr',     date: times.asrDate,     display: times.Asr     },
    { name: 'Maghrib', date: times.maghribDate,  display: times.Maghrib },
    { name: 'Isha',    date: times.ishaDate,    display: times.Isha    },
  ].filter(p => p.date instanceof Date)

  const next = prayers.find(p => p.date > now)
  if (next) return next

  // All prayers have passed — Fajr is tomorrow; advance its date by 1 day
  const fajr = prayers[0]
  if (!fajr) return null
  const tomorrowFajr = new Date(fajr.date)
  tomorrowFajr.setDate(tomorrowFajr.getDate() + 1)
  return { ...fajr, date: tomorrowFajr }
}

function pad(n) { return String(n).padStart(2, '0') }

export default function NextPrayerCard({ times }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const next = getNextPrayer(times)
  if (!next) return null

  const diffMs = Math.max(0, next.date - now)
  const h = Math.floor(diffMs / 3_600_000)
  const m = Math.floor((diffMs % 3_600_000) / 60_000)
  const s = Math.floor((diffMs % 60_000) / 1_000)

  return (
    <div style={{
      margin: '16px 0',
      background: 'linear-gradient(135deg, rgba(var(--cp-acc-rgb,63,224,197),0.1) 0%, rgba(59,141,255,0.07) 100%)',
      border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.25)',
      borderRadius: 8, padding: '14px 18px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '0.18em',
          color: 'var(--cp-acc)', marginBottom: 4 }}>NEXT PRAYER</div>
        <div style={{ fontFamily: T.sans, fontSize: 22, fontWeight: 700,
          color: T.ink, marginBottom: 2 }}>{next.name}</div>
        <div style={{ fontFamily: T.mono, fontSize: 13, color: T.ink2 }}>{next.display}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '0.14em',
          color: T.dim, marginBottom: 4 }}>IN</div>
        <div style={{ fontFamily: T.mono, fontSize: 28, fontWeight: 700,
          color: 'var(--cp-acc)', lineHeight: 1 }}>
          {pad(h)}:{pad(m)}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 11, color: T.dim, marginTop: 2 }}>{pad(s)}s</div>
      </div>
    </div>
  )
}
