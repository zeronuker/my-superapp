import { useState, useMemo } from 'react'
import { calculateLocal } from '../services/adhanLocal'
import Header        from '../components/Header'
import NextPrayerCard from '../components/NextPrayerCard'
import PrayerRow     from '../components/PrayerRow'
import OfflinePill   from '../components/OfflinePill'
import { T }         from '../components/tokens'

const METHOD_LABELS = {
  jakim:        'JAKIM (Malaysia)',
  moonsighting: 'Moonsighting Committee',
  mwl:          'Muslim World League',
  isna:         'ISNA (North America)',
  egyptian:     'Egyptian General Authority',
  uaq:          'Umm Al-Qura (Makkah)',
}

function buildRows(times, isToday) {
  if (!times) return []
  const now = new Date()
  const prayers = [
    { name: 'Imsak',   time: times.Imsak,   date: times.imsakDate,   isSunrise: false, isImsak: true  },
    { name: 'Fajr',    time: times.Fajr,    date: times.fajrDate,    isSunrise: false, isImsak: false },
    { name: 'Sunrise', time: times.Sunrise,  date: times.sunriseDate, isSunrise: true,  isImsak: false },
    { name: 'Dhuhr',   time: times.Dhuhr,   date: times.dhuhrDate,   isSunrise: false, isImsak: false },
    { name: 'Asr',     time: times.Asr,     date: times.asrDate,     isSunrise: false, isImsak: false },
    { name: 'Maghrib', time: times.Maghrib,  date: times.maghribDate, isSunrise: false, isImsak: false },
    { name: 'Isha',    time: times.Isha,    date: times.ishaDate,    isSunrise: false, isImsak: false },
  ]

  const isRef = p => p.isSunrise
  const activePrayers = prayers.filter(p => !isRef(p))
  const nextPrayer = isToday
    ? (activePrayers.find(p => p.date instanceof Date && p.date > now) ?? activePrayers[0])
    : null

  return prayers.map(p => ({
    ...p,
    done:   isToday && p.date instanceof Date && p.date < now && !isRef(p) && !p.isImsak,
    isNext: isToday && !isRef(p) && !p.isImsak && p.name === nextPrayer?.name,
  }))
}

function DayStrip({ selected, onChange }) {
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return {
      offset: i,
      top:   i === 0 ? 'TODAY' : d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      num:   d.getDate(),
      month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    }
  })
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
      {days.map(({ offset, top, num, month }) => {
        const active = offset === selected
        return (
          <button
            key={offset}
            onClick={() => onChange(offset)}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 6,
              border: `1px solid ${active ? 'var(--cp-acc)' : 'var(--cp-border2)'}`,
              background: active ? 'rgba(var(--cp-acc-rgb,63,224,197),0.12)' : 'var(--cp-bg3)',
              cursor: 'pointer', textAlign: 'center',
            }}
          >
            <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '0.12em',
              color: active ? 'var(--cp-acc)' : T.dim, marginBottom: 2 }}>{top}</div>
            <div style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700,
              color: active ? 'var(--cp-acc)' : T.ink, lineHeight: 1 }}>{num}</div>
            <div style={{ fontFamily: T.mono, fontSize: 7, color: T.dim,
              letterSpacing: '0.1em', marginTop: 2 }}>{month}</div>
          </button>
        )
      })}
    </div>
  )
}

export default function PrayerTimesPage({
  location, gpsStatus, gpsError, permissionState, onGpsLocate, onManualSelect,
  times, loading, source, settings,
}) {
  const [dayOffset, setDayOffset] = useState(0)

  const displayTimes = useMemo(() => {
    if (dayOffset === 0 || !times) return times
    if (!location?.lat || !location?.lng) return times
    const d = new Date()
    d.setDate(d.getDate() + dayOffset)
    return calculateLocal(
      location.lat, location.lng, d,
      settings?.calculationMethod ?? 'jakim',
      settings?.madhab ?? 'shafi',
      settings?.timeFormat ?? '24hr',
    )
  }, [dayOffset, times, location, settings])

  const isToday = dayOffset === 0
  const rows = buildRows(displayTimes, isToday)

  const denied = permissionState === 'denied'

  return (
    <div>
      <Header
        location={location}
        gpsStatus={gpsStatus}
        gpsError={gpsError}
        onGpsLocate={onGpsLocate}
        onManualSelect={onManualSelect}
      />

      {loading && !times && (
        <div style={{ padding: '24px 0', textAlign: 'center',
          fontFamily: T.mono, fontSize: 11, color: T.dim, letterSpacing: '0.12em' }}>
          LOADING PRAYER TIMES…
        </div>
      )}

      {!loading && !times && !location && (
        <div style={{
          margin: '24px 0',
          background: denied
            ? 'rgba(251,146,60,0.06)'
            : 'rgba(var(--cp-acc-rgb,63,224,197),0.05)',
          border: `1px solid ${denied ? 'rgba(251,146,60,0.25)' : 'rgba(var(--cp-acc-rgb,63,224,197),0.2)'}`,
          borderRadius: 8, padding: '20px 18px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>{denied ? '🔒' : '📍'}</div>
          <div style={{
            fontFamily: T.mono, fontSize: 10, letterSpacing: '0.16em', marginBottom: 8,
            color: denied ? T.orange : 'var(--cp-acc)',
          }}>
            {denied ? 'LOCATION BLOCKED' : 'LOCATION NEEDED'}
          </div>

          {denied ? (
            <>
              <div style={{ fontFamily: T.sans, fontSize: 13, color: T.ink2,
                lineHeight: 1.7, marginBottom: 4 }}>
                Location permission was blocked. To fix this:
              </div>
              <div style={{ fontFamily: T.sans, fontSize: 12, color: T.dim,
                lineHeight: 1.9, marginBottom: 16, textAlign: 'left',
                background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: '10px 14px',
              }}>
                <b style={{ color: T.ink2 }}>On Android:</b><br />
                Open Chrome → tap ⋮ → Settings →<br />
                Site settings → Location → find this site → Allow<br />
                <br />
                <b style={{ color: T.ink2 }}>On iOS:</b><br />
                Settings → Chrome (or Safari) →<br />
                Location → Allow
              </div>
              <div style={{ fontFamily: T.sans, fontSize: 12, color: T.dim,
                lineHeight: 1.5 }}>
                Or search for your city using the field above.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: T.sans, fontSize: 13, color: T.ink2,
                lineHeight: 1.6, marginBottom: 16 }}>
                Tap the button below to share your location,
                or search for a city using the field above.
              </div>
              <button
                onClick={onGpsLocate}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'rgba(var(--cp-acc-rgb,63,224,197),0.12)',
                  border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.4)',
                  borderRadius: 6, padding: '10px 20px', cursor: 'pointer',
                  fontFamily: T.mono, fontSize: 10, letterSpacing: '0.14em',
                  color: 'var(--cp-acc)',
                }}
              >
                <span style={{ fontSize: 16 }}>⊕</span>
                USE MY LOCATION
              </button>
            </>
          )}
        </div>
      )}

      {times && (
        <>
          <DayStrip selected={dayOffset} onChange={setDayOffset} />
          {isToday && <NextPrayerCard times={displayTimes} />}
          <OfflinePill source={source} />
          <div style={{ margin: '8px 0' }}>
            {rows.map(row => <PrayerRow key={row.name} {...row} />)}
          </div>
          <div style={{ paddingTop: 12, textAlign: 'center' }}>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.1em' }}>
              {(METHOD_LABELS[settings?.calculationMethod] ?? 'JAKIM (Malaysia)').toUpperCase()}
              {' · '}
              {settings?.madhab === 'hanafi' ? 'HANAFI' : "SHAFI'I"}
              {' · '}
              {source === 'api' ? 'ALADHAN API' : 'LOCAL CALCULATION'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
