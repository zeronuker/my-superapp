import { useState, useEffect, useRef } from 'react'
import { T } from './tokens'
import { searchCities } from '../services/geolocation'

// ── Hijri date using built-in Intl (no extra dependency) ─────────────────────
const HIJRI_MONTHS_MY = [
  'Muharam', 'Safar', 'Rabiulawal', 'Rabiulakhir',
  'Jamadilawal', 'Jamadilakhir', 'Rejab', 'Syaaban',
  'Ramadan', 'Syawal', 'Zulkaedah', 'Zulhijjah',
]

function getHijriDate(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      year: 'numeric', month: 'numeric', day: 'numeric',
    }).formatToParts(date)
    const day       = parts.find(p => p.type === 'day')?.value
    const month     = parts.find(p => p.type === 'month')?.value
    const year      = parts.find(p => p.type === 'year')?.value
    const monthName = HIJRI_MONTHS_MY[parseInt(month) - 1] ?? ''
    return `${day} ${monthName.toUpperCase()} ${year}H`
  } catch { return '' }
}

function getGregorianDate(date = new Date()) {
  return date.toLocaleDateString('en-MY', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Quick-pick cities shown before the user starts typing ─────────────────────
const QUICK_PICKS = [
  { name: 'Kuala Lumpur', country: 'Malaysia',   lat: 3.139,  lng: 101.687 },
  { name: 'Singapore',    country: 'Singapore',  lat: 1.352,  lng: 103.820 },
  { name: 'Dubai',        country: 'UAE',         lat: 25.204, lng: 55.270  },
  { name: 'London',       country: 'UK',          lat: 51.507, lng: -0.128  },
  { name: 'Istanbul',     country: 'Turkey',      lat: 41.015, lng: 28.979  },
]

// ── Header ────────────────────────────────────────────────────────────────────
export default function Header({ location, onGpsLocate, onManualSelect, gpsStatus, gpsError }) {
  const [now,       setNow]       = useState(new Date())
  const [editing,   setEditing]   = useState(false)
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState(false)
  const inputRef   = useRef(null)
  const debounceRef = useRef(null)

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Debounced Nominatim city search
  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setSearching(false)
      setSearchErr(false)
      return
    }
    setSearching(true)
    setSearchErr(false)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const cities = await searchCities(query)
        setResults(cities)
        setSearchErr(cities.length === 0)
      } catch {
        setResults([])
        setSearchErr(true)
      } finally {
        setSearching(false)
      }
    }, 450)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')

  const startEdit = () => {
    setEditing(true)
    setQuery('')
    setResults([])
    setTimeout(() => inputRef.current?.focus(), 40)
  }

  const closeEdit = () => {
    setEditing(false)
    setQuery('')
    setResults([])
    setSearchErr(false)
  }

  const selectCity = (city) => {
    onManualSelect(city.name, city.country, city.lat, city.lng)
    closeEdit()
  }

  const handleGps = () => {
    closeEdit()
    onGpsLocate()
  }

  const locating  = gpsStatus === 'locating'
  const gpsError_ = gpsStatus === 'error' || gpsError
  const cityName  = location?.city || location?.name || null
  const locLabel  = location
    ? location.country
      ? `${cityName ?? 'Current Location'}, ${location.country}`
      : (cityName ?? 'Current Location')
    : 'Set location…'

  // Determine what to show in the search dropdown
  const showQuickPicks = query.length < 2 && results.length === 0
  const displayList    = query.length < 2 ? QUICK_PICKS : results

  return (
    <div style={{ paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>

      {/* Clock */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <span style={{ fontFamily: T.mono, fontSize: 38, fontWeight: 700,
          color: T.ink, letterSpacing: '0.03em', lineHeight: 1 }}>
          {hh}:{mm}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 16, color: T.dim }}>{ss}</span>
      </div>

      {/* Hijri date */}
      <div style={{ fontFamily: T.mono, fontSize: 10, color: 'var(--cp-acc)',
        letterSpacing: '0.16em', marginBottom: 2 }}>
        {getHijriDate(now)}
      </div>

      {/* Gregorian date */}
      <div style={{ fontFamily: T.sans, fontSize: 12, color: T.ink2, marginBottom: 10 }}>
        {getGregorianDate(now)}
      </div>

      {/* GPS error banner — shown above location pill when GPS fails */}
      {gpsError_ && !editing && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: 'rgba(251,146,60,0.08)',
          border: '1px solid rgba(251,146,60,0.3)',
          borderRadius: 6, padding: '8px 12px', marginBottom: 8,
        }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.orange,
              letterSpacing: '0.12em', marginBottom: 3 }}>
              LOCATION UNAVAILABLE
            </div>
            <div style={{ fontFamily: T.sans, fontSize: 11, color: T.dim, lineHeight: 1.5 }}>
              Location access was denied or unavailable.
              In your browser settings, allow location for this site — then tap the location below to try again.
            </div>
          </div>
        </div>
      )}

      {/* Location row */}
      {!editing ? (
        <button
          onClick={locating ? undefined : startEdit}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', textAlign: 'left',
            cursor: locating ? 'default' : 'pointer',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${locating ? 'var(--cp-acc)' : gpsError_ ? 'rgba(251,146,60,0.4)' : T.bord2}`,
            borderRadius: 6, padding: '7px 12px',
          }}
        >
          <span style={{ fontSize: 13 }}>{locating ? '⊕' : gpsError_ ? '⚠' : '📍'}</span>
          <span style={{
            fontFamily: T.sans, fontSize: 13, flex: 1,
            color: locating ? 'var(--cp-acc)' : gpsError_ ? T.orange : T.ink,
          }}>
            {locating ? 'Locating…' : gpsError_ && !location ? 'Location unavailable' : locLabel}
          </span>
          {!locating && (
            location?.source === 'gps'
              ? <span style={{ fontFamily: T.mono, fontSize: 8, color: 'var(--cp-acc)',
                  background: 'rgba(var(--cp-acc-rgb,63,224,197),0.12)',
                  border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.3)',
                  borderRadius: 3, padding: '2px 5px', letterSpacing: '0.1em' }}>GPS</span>
              : <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.1em' }}>
                  TAP TO CHANGE
                </span>
          )}
        </button>
      ) : (
        <div>
          {/* Search input */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search any city…"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              style={{
                flex: 1, background: T.bg1,
                border: '1px solid var(--cp-acc)',
                borderRadius: 6, color: T.ink,
                fontFamily: T.sans, fontSize: 13,
                padding: '8px 12px', outline: 'none',
              }}
            />
            <button onClick={closeEdit} style={{
              background: 'transparent', border: `1px solid ${T.bord2}`,
              borderRadius: 6, color: T.dim,
              fontFamily: T.mono, fontSize: 9, letterSpacing: '0.1em',
              padding: '6px 10px', cursor: 'pointer',
            }}>✕</button>
          </div>

          {/* GPS option */}
          <button onClick={handleGps} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%',
            background: 'rgba(var(--cp-acc-rgb,63,224,197),0.06)',
            border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.25)',
            borderRadius: 6, padding: '8px 12px', cursor: 'pointer', marginBottom: 6,
          }}>
            <span style={{ fontSize: 14 }}>⊕</span>
            <span style={{ fontFamily: T.sans, fontSize: 12, color: 'var(--cp-acc)' }}>
              Use my current location (GPS)
            </span>
          </button>

          {/* Searching spinner */}
          {searching && (
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim,
              letterSpacing: '0.12em', padding: '6px 12px' }}>
              SEARCHING…
            </div>
          )}

          {/* No results */}
          {!searching && searchErr && query.length >= 2 && (
            <div style={{ fontFamily: T.sans, fontSize: 12, color: T.dim,
              padding: '8px 12px', lineHeight: 1.5 }}>
              No cities found for "{query}". Try a different spelling.
            </div>
          )}

          {/* City list — quick picks or search results */}
          {!searching && displayList.length > 0 && (
            <div style={{
              background: T.bg1, border: `1px solid ${T.bord2}`,
              borderRadius: 6, overflow: 'hidden',
            }}>
              {showQuickPicks && (
                <div style={{ fontFamily: T.mono, fontSize: 8, color: T.dim,
                  letterSpacing: '0.12em', padding: '6px 12px 4px' }}>
                  POPULAR
                </div>
              )}
              {displayList.map((city, i) => (
                <button
                  key={`${city.name}-${city.country}-${i}`}
                  onClick={() => selectCity(city)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', background: 'transparent', border: 'none',
                    borderBottom: i < displayList.length - 1 ? `1px solid ${T.border}` : 'none',
                    padding: '9px 12px', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontFamily: T.sans, fontSize: 13, color: T.ink }}>{city.name}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim,
                      letterSpacing: '0.08em', marginTop: 2 }}>
                      {city.country}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: T.dim }}>→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
