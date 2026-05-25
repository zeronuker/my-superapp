import Header       from '../components/Header'
import NextPrayerCard from '../components/NextPrayerCard'
import PrayerRow    from '../components/PrayerRow'
import OfflinePill  from '../components/OfflinePill'
import { T }        from '../components/tokens'

const METHOD_LABELS = {
  jakim:        'JAKIM (Malaysia)',
  moonsighting: 'Moonsighting Committee',
  mwl:          'Muslim World League',
  isna:         'ISNA (North America)',
  egyptian:     'Egyptian General Authority',
  uaq:          'Umm Al-Qura (Makkah)',
}

function buildRows(times) {
  if (!times) return []
  const now = new Date()
  const prayers = [
    { name: 'Fajr',    time: times.Fajr,    date: times.fajrDate,    isSunrise: false },
    { name: 'Sunrise', time: times.Sunrise,  date: times.sunriseDate, isSunrise: true  },
    { name: 'Dhuhr',   time: times.Dhuhr,   date: times.dhuhrDate,   isSunrise: false },
    { name: 'Asr',     time: times.Asr,     date: times.asrDate,     isSunrise: false },
    { name: 'Maghrib', time: times.Maghrib,  date: times.maghribDate,  isSunrise: false },
    { name: 'Isha',    time: times.Isha,    date: times.ishaDate,    isSunrise: false },
  ]

  // Find next non-sunrise prayer (wraps to tomorrow's Fajr after Isha)
  const activePrayers = prayers.filter(p => !p.isSunrise)
  const nextPrayer    = activePrayers.find(p => p.date instanceof Date && p.date > now)
    ?? activePrayers[0] // after Isha: highlight Fajr row as "next" (tomorrow)

  return prayers.map(p => ({
    ...p,
    done:   p.date instanceof Date && p.date < now && !p.isSunrise,
    isNext: !p.isSunrise && p.name === nextPrayer?.name,
  }))
}

export default function PrayerTimesPage({
  location, gpsStatus, gpsError, onGpsLocate, onManualSelect,
  times, loading, source, settings,
}) {
  const rows = buildRows(times)

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
        <div style={{ padding: '24px 0', textAlign: 'center',
          fontFamily: T.sans, fontSize: 13, color: T.dim, lineHeight: 1.6 }}>
          Enable location or search for a city above to load prayer times.
        </div>
      )}

      {times && (
        <>
          <NextPrayerCard times={times} />
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
