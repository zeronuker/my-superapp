import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { haptic } from '../utils/haptic'
import { lookupAirport, searchAirports } from '../data/airports'
import { distanceNm, bearingDeg } from '../utils/geo'
import {
  fmtAlt, fmtVs, fmtPinged, fmtDistBrg, fmtDelay, fmtWakeCategory,
  normalizeAircraft, normalizeFlightStatus, normalizeAircraftLookup, normalizeAirline, normalizeAircraftPerformance,
} from '../utils/traffic'
import ResetButton from './ResetButton'

// ── Fallback anchor when no center is resolvable yet (empty input, unknown
// ICAO, GPS not granted) — Kuala Lumpur Intl, keeps the tab non-empty. ──
const FALLBACK_ANCHOR = { lat: 2.7456, lng: 101.7099 }

const CARD_FIELDS = [
  { key: 'registration',     label: 'Registration',         group: 'live' },
  { key: 'icao24',           label: 'ICAO24',                group: 'live' },
  { key: 'aircraft_type',    label: 'Aircraft type',         group: 'live' },
  { key: 'altitude',         label: 'Altitude',              group: 'live' },
  { key: 'ground_speed',     label: 'Ground speed',          group: 'live' },
  { key: 'track',            label: 'Track',                 group: 'live' },
  { key: 'vertical_rate',    label: 'Vertical rate',         group: 'live' },
  { key: 'squawk',           label: 'Squawk',                group: 'live' },
  { key: 'on_ground',        label: 'On ground flag',        group: 'live' },
  { key: 'pinged',           label: 'Last pinged',           group: 'live' },
  { key: 'type_name',        label: 'Type name',             group: 'lookup' },
  { key: 'manufacturer',     label: 'Manufacturer',          group: 'lookup' },
  { key: 'operator',         label: 'Operator',              group: 'lookup' },
  { key: 'operator_icao',    label: 'Operator ICAO',         group: 'lookup' },
  { key: 'operator_iata',    label: 'Operator IATA',         group: 'lookup' },
  { key: 'country',          label: 'Operator country',      group: 'lookup' },
  { key: 'engine_type',      label: 'Engine type',           group: 'lookup' },
  { key: 'wake_category',    label: 'Wake category',         group: 'lookup' },
  { key: 'cruise_speed',     label: 'Cruise speed',          group: 'lookup' },
  { key: 'max_range',        label: 'Max range',             group: 'lookup' },
  { key: 'service_ceiling',  label: 'Service ceiling',       group: 'lookup' },
  { key: 'wingspan',         label: 'Wingspan',              group: 'lookup' },
  { key: 'length',           label: 'Length',                group: 'lookup' },
  { key: 'mtow',             label: 'MTOW',                  group: 'lookup' },
  { key: 'year_manufactured',label: 'Year built',            group: 'lookup' },
  { key: 'serial_number',    label: 'Serial number',         group: 'lookup' },
  { key: 'flight_number',    label: 'Flight number',         group: 'status' },
  { key: 'airline',          label: 'Airline IATA/ICAO',     group: 'status' },
  { key: 'scheduled',        label: 'Scheduled dep/arr',     group: 'status' },
  { key: 'estimated',        label: 'Estimated arrival',     group: 'status' },
  { key: 'status',           label: 'Status',                group: 'status' },
  { key: 'delay',            label: 'Delay',                 group: 'status' },
]
const ROW_FIELDS = [
  { key: 'registration',  label: 'Reg' },
  { key: 'icao24',        label: 'ICAO24' },
  { key: 'aircraft_type', label: 'Type' },
  { key: 'altitude',      label: 'Alt' },
  { key: 'ground_speed',  label: 'GS' },
  { key: 'track',         label: 'Trk' },
  { key: 'vertical_rate', label: 'V/S' },
  { key: 'squawk',        label: 'Squawk' },
  { key: 'on_ground',     label: 'On Grnd' },
  { key: 'route',         label: 'Airline' },
  { key: 'dist_brg',      label: 'Dist/Brg' },
  { key: 'last_contact',  label: 'Age' },
  { key: 'status',        label: 'Status' },
]

// ── Fetch helpers — thin wrappers over the Vercel proxies in /api ──
// Response is { aircraft: [...], total_count, timestamp } — not a bare array.
async function fetchTraffic(lat, lon, radiusNm, signal) {
  const params = new URLSearchParams({ lat, lon, radius: radiusNm })
  const res = await fetch(`/api/skylink-adsb?${params}`, { signal })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
  return Array.isArray(body?.aircraft) ? body.aircraft : []
}
async function pingAircraft(icao24, signal) {
  const params = new URLSearchParams({ icao24 })
  const res = await fetch(`/api/skylink-adsb?${params}`, { signal })
  if (!res.ok) return null
  const body = await res.json().catch(() => null)
  return body?.aircraft?.[0] ?? null
}
// Global search — no lat/lon, searches the whole live feed by callsign.
async function fetchByCallsign(callsign, signal) {
  const params = new URLSearchParams({ callsign })
  const res = await fetch(`/api/skylink-adsb?${params}`, { signal })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
  return Array.isArray(body?.aircraft) ? body.aircraft : []
}
async function fetchAircraftLookup(registration, icao24, signal) {
  const params = new URLSearchParams(registration && registration !== '—' ? { registration } : { icao24 })
  const res = await fetch(`/api/skylink-aircraft?${params}`, { signal })
  if (!res.ok) return null
  return res.json().catch(() => null)
}
async function fetchFlightStatus(flightOrCallsign, signal) {
  const params = new URLSearchParams({ flight: flightOrCallsign })
  const res = await fetch(`/api/skylink-flight-status?${params}`, { signal })
  if (!res.ok) return null
  return res.json().catch(() => null)
}
async function fetchAirlineInfo(icaoCode, signal) {
  const params = new URLSearchParams({ icao: icaoCode })
  const res = await fetch(`/api/skylink-airlines?${params}`, { signal })
  if (!res.ok) return null
  return res.json().catch(() => null)
}
async function fetchAircraftPerformance(icaoType, signal) {
  const params = new URLSearchParams({ icao_type: icaoType })
  const res = await fetch(`/api/skylink-aircraft-performance?${params}`, { signal })
  if (!res.ok) return null
  return res.json().catch(() => null)
}

// Fallback "popular" airports when the METAR/TAF module has nothing cached yet.
const POPULAR_AIRPORTS = ['WMKK', 'YMML', 'RJAA', 'OMDB', 'VABB']

// ── Read the sibling METAR/TAF module's cached airports for the picker's
// quick-pick list, enriched with name/city/country for display. Falls back
// to POPULAR_AIRPORTS when nothing is cached. ──
function buildPopularAirports() {
  const enrich = (icao, label) => {
    const a = lookupAirport(icao)
    return a ? { icao, label, name: a.name, city: a.city, country: a.country } : null
  }
  try {
    const raw = localStorage.getItem('cb-metar-cache')
    if (raw) {
      const c = JSON.parse(raw)
      const list = []
      const add = (icao, label) => { if (icao?.trim()) { const e = enrich(icao.trim().toUpperCase(), label); if (e) list.push(e) } }
      add(c.dep, 'DEP')
      add(c.arr, 'ARR')
      add(c.destAlts?.alt1, 'ALT1')
      add(c.destAlts?.alt2, 'ALT2')
      for (let i = 0; i < (c.enrouteCount || 0); i++) add(c.enrouteAlts?.[i], `ERA${i + 1}`)
      if (list.length > 0) return list
    }
  } catch (_) { /* fall through to defaults */ }
  return POPULAR_AIRPORTS.map(icao => enrich(icao, null)).filter(Boolean)
}

function SectionHeader({ title }) {
  return (
    <div className="cp-section-header">
      <span className="cp-section-title">{title}</span>
      <div className="cp-divider" />
    </div>
  )
}

export default function TrafficViewer() {
  const { settings, updateSettings } = useCalculatorStore(s => ({
    settings: s.settings, updateSettings: s.updateSettings,
  }))

  const [centerIcao, setCenterIcao] = useState('')
  const [centerMode, setCenterMode] = useState('icao') // 'icao' | 'gps'
  const [gpsCoords, setGpsCoords] = useState(null)
  const [gpsError, setGpsError] = useState('')
  const [radius, setRadius] = useState(50)
  const [aircraft, setAircraft] = useState({})
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [selectedKey, setSelectedKey] = useState(null)
  const [pingingKey, setPingingKey] = useState(null)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [searchQuery, setSearchQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [detailsCache, setDetailsCache] = useState({}) // icao24 -> { loading, lookup, flightStatus }
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)
  const [globalSearch, setGlobalSearch] = useState(false)
  const [globalResults, setGlobalResults] = useState({})
  const [globalLoading, setGlobalLoading] = useState(false)
  const [globalError, setGlobalError] = useState('')

  const popularAirports = useMemo(buildPopularAirports, [])
  const pickerResults = pickerQuery.trim().length >= 2 ? searchAirports(pickerQuery) : popularAirports

  const handleReset = () => {
    setCenterIcao(''); setCenterMode('icao'); setGpsCoords(null); setGpsError('')
    setRadius(50); setSelectedKey(null); setSearchQuery('')
    setPickerOpen(false); setPickerQuery('')
    setGlobalSearch(false); setGlobalResults({}); setGlobalError('')
  }

  const handleGps = () => {
    if (!navigator.geolocation) { setGpsError('Geolocation not available on this device'); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setCenterMode('gps'); setGpsError('')
        setPickerOpen(false); setPickerQuery('')
      },
      () => setGpsError('Location permission denied — using default center'),
    )
  }

  const choosePickerAirport = (icao) => {
    setCenterIcao(icao); setCenterMode('icao')
    setPickerOpen(false); setPickerQuery('')
  }

  // ── Resolve the active center → anchor lat/lng ──
  const centerAirport = centerMode === 'icao' && centerIcao.trim().length >= 3
    ? lookupAirport(centerIcao) : lookupAirport('WMKK')
  const anchor = centerMode === 'gps' && gpsCoords
    ? gpsCoords
    : (centerAirport ? { lat: centerAirport.lat, lng: centerAirport.lng } : FALLBACK_ANCHOR)
  const centerIcaoResolved = centerMode === 'icao' && centerIcao.trim() ? centerIcao.trim() : 'WMKK'
  const centerLabel = centerMode === 'gps' && gpsCoords
    ? 'My GPS Location'
    : (centerAirport ? `${centerIcaoResolved} — ${centerAirport.city}, ${centerAirport.country}` : centerIcaoResolved)

  // ── Offline/online tracking — traffic positions are only meaningful live,
  // so this tab blocks entirely offline rather than showing stale data. ──
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // ── Live traffic fetch — refires when the center, radius, or connectivity
  // changes. Skipped entirely while offline (no request, no browser dialog). ──
  useEffect(() => {
    if (isOffline) { setLoading(false); return }
    const controller = new AbortController()
    setLoading(true); setFetchError('')
    fetchTraffic(anchor.lat, anchor.lng, radius, controller.signal)
      .then(list => {
        const next = {}
        for (const raw of list) {
          const a = normalizeAircraft(raw)
          if (a.icao24) next[a.icao24] = a
        }
        setAircraft(next)
      })
      .catch(e => { if (e.name !== 'AbortError') setFetchError(e.message || 'Failed to load traffic') })
      .finally(() => setLoading(false))
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor.lat, anchor.lng, radius, isOffline])

  // ── Global search — debounced, fires only in "search anywhere" mode.
  // Searches the whole live feed by callsign, no location filter. ──
  useEffect(() => {
    if (!globalSearch || isOffline) { setGlobalResults({}); setGlobalError(''); return }
    const term = searchQuery.split(',')[0].trim()
    if (term.length < 2) { setGlobalResults({}); setGlobalError(''); return }
    const controller = new AbortController()
    const t = setTimeout(() => {
      setGlobalLoading(true); setGlobalError('')
      fetchByCallsign(term, controller.signal)
        .then(list => {
          const next = {}
          for (const raw of list) {
            const a = normalizeAircraft(raw)
            if (a.icao24) next[a.icao24] = a
          }
          setGlobalResults(next)
        })
        .catch(e => { if (e.name !== 'AbortError') setGlobalError(e.message || 'Global search failed') })
        .finally(() => setGlobalLoading(false))
    }, 400)
    return () => { clearTimeout(t); controller.abort() }
  }, [globalSearch, searchQuery, isOffline])

  const flightsWithGeo = useMemo(() => {
    return Object.fromEntries(Object.entries(aircraft).map(([key, f]) => {
      const hasPos = typeof f.lat === 'number' && typeof f.lon === 'number'
      return [key, {
        ...f,
        distNm: hasPos ? distanceNm(anchor.lat, anchor.lng, f.lat, f.lon) : null,
        brgDeg: hasPos ? bearingDeg(anchor.lat, anchor.lng, f.lat, f.lon) : null,
      }]
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraft, anchor.lat, anchor.lng])

  // Global results get the same dist/bearing-from-center treatment, purely
  // for context ("how far is this from where I'm looking") — the search
  // itself isn't location-limited.
  const globalWithGeo = useMemo(() => {
    return Object.fromEntries(Object.entries(globalResults).map(([key, f]) => {
      const hasPos = typeof f.lat === 'number' && typeof f.lon === 'number'
      return [key, {
        ...f,
        distNm: hasPos ? distanceNm(anchor.lat, anchor.lng, f.lat, f.lon) : null,
        brgDeg: hasPos ? bearingDeg(anchor.lat, anchor.lng, f.lat, f.lon) : null,
      }]
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalResults, anchor.lat, anchor.lng])

  // ── Lazy-fetch aircraft lookup + flight status only for the selected row —
  // avoids N extra API calls just to render the table. ──
  // Aircraft lookup + flight status are independent, so they fire together.
  // Airline info and performance both depend on fields the lookup call
  // returns (airline_code, icao_type), so they fire in a second wave once
  // it resolves — still far faster than a fully sequential chain.
  useEffect(() => {
    if (isOffline || !selectedKey || detailsCache[selectedKey]) return
    const f = aircraft[selectedKey]
    if (!f) return
    const controller = new AbortController()
    setDetailsCache(prev => ({ ...prev, [selectedKey]: { loading: true } }))
    Promise.all([
      fetchAircraftLookup(f.registration, f.icao24, controller.signal).catch(() => null),
      fetchFlightStatus(f.callsign, controller.signal).catch(() => null),
    ]).then(async ([lookupRaw, statusRaw]) => {
      const lookup = normalizeAircraftLookup(lookupRaw)
      const [airlineRaw, perfRaw] = await Promise.all([
        lookup?.operator_icao ? fetchAirlineInfo(lookup.operator_icao, controller.signal).catch(() => null) : null,
        lookup?.icao_type ? fetchAircraftPerformance(lookup.icao_type, controller.signal).catch(() => null) : null,
      ])
      setDetailsCache(prev => ({
        ...prev,
        [selectedKey]: {
          loading: false,
          lookup,
          airlineInfo: normalizeAirline(airlineRaw),
          performance: normalizeAircraftPerformance(perfRaw),
          flightStatus: normalizeFlightStatus(statusRaw),
        },
      }))
    })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey])

  const pingFlight = useCallback((key) => {
    const icao24 = aircraft[key]?.icao24
    if (!icao24) return
    setPingingKey(key)
    const controller = new AbortController()
    pingAircraft(icao24, controller.signal)
      .then(raw => {
        setAircraft(prev => {
          if (!prev[key]) return prev
          const fresh = raw ? normalizeAircraft(raw) : {}
          return { ...prev, [key]: { ...prev[key], ...fresh, pingedAt: Date.now() } }
        })
      })
      .catch(() => { /* stale data stays — ping just didn't refresh this time */ })
      .finally(() => { setPingingKey(null); setNow(Date.now()); haptic('light') })
  }, [aircraft])

  const cf = settings.trafficFields.card
  const rf = settings.trafficFields.row
  const activeRowFields = ROW_FIELDS.filter(f => rf[f.key])

  // Comma-separated terms — an aircraft matches if ANY term matches ANY of callsign/reg/flight#.
  // In "search anywhere" mode the server already filtered by callsign (first term only,
  // that's all the API takes), so the local list is shown as-is rather than re-filtered.
  const searchTerms = searchQuery.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
  const filteredFlights = globalSearch
    ? globalWithGeo
    : (searchTerms.length
      ? Object.fromEntries(Object.entries(flightsWithGeo).filter(([key, f]) => {
          const status = detailsCache[key]?.flightStatus
          return searchTerms.some(term =>
            f.callsign.includes(term) || f.registration.includes(term) || (status?.flight && status.flight.includes(term)))
        }))
      : flightsWithGeo)
  const selectedDetails = selectedKey ? detailsCache[selectedKey] : null
  const selected = selectedKey ? flightsWithGeo[selectedKey] : null

  // Selecting a global-search row merges it into local aircraft state first,
  // so the existing detail-fetch/FlightStatusPanel machinery (which reads
  // off flightsWithGeo/aircraft) works completely unchanged either way.
  const selectRow = (key) => {
    if (globalSearch && globalResults[key] && !aircraft[key]) {
      setAircraft(prev => ({ ...prev, [key]: globalResults[key] }))
    }
    setSelectedKey(k => k === key ? null : key)
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <ResetButton onReset={handleReset} />
      </div>

      {isOffline && (
        <div style={{
          background: 'rgba(252,211,77,0.07)', border: '1px solid rgba(252,211,77,0.25)',
          borderLeft: '3px solid var(--cp-yellow)', borderRadius: 4, padding: '8px 14px', marginBottom: 20,
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--cp-yellow)',
        }}>
          ⚠ REQUIRES INTERNET CONNECTION — traffic is live-only, resumes automatically once you're back online
        </div>
      )}

      {!isOffline && fetchError && (
        <div style={{
          background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.25)',
          borderLeft: '3px solid var(--cp-red)', borderRadius: 4, padding: '8px 14px', marginBottom: 20,
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--cp-red)',
        }}>
          ⚠ {fetchError}
        </div>
      )}

      <div style={isOffline ? { opacity: 0.35, filter: 'grayscale(1)', pointerEvents: 'none' } : undefined}>

      {/* ── Center ── */}
      <SectionHeader title="Center" />
      <div style={{ marginBottom: 8 }}>
        {pickerOpen ? (
          <div style={{ background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)', borderRadius: 6, padding: 10 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input className="cp-input" autoFocus placeholder="Search ICAO, airport, or city…"
                style={{ flex: 1, borderColor: 'var(--cp-acc)' }}
                value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} />
              <button className="cp-btn" onClick={() => { setPickerOpen(false); setPickerQuery('') }}>✕</button>
            </div>

            <button onClick={handleGps} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              background: 'var(--cp-accdim)', border: '1px solid var(--cp-acc)', borderRadius: 6,
              padding: '8px 12px', cursor: 'pointer', marginBottom: 6,
            }}>
              <span style={{ fontSize: 14 }}>⊕</span>
              <span style={{ fontFamily: 'var(--cb-font-body)', fontSize: 12, color: 'var(--cp-acc)' }}>Use my current location (GPS)</span>
            </button>

            <div style={{ background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 8, color: 'var(--cp-dim)', letterSpacing: '0.12em', padding: '6px 12px 4px' }}>
                {pickerQuery.trim().length >= 2 ? 'RESULTS' : 'POPULAR'}
              </div>
              {pickerResults.length === 0 ? (
                <div style={{ padding: '9px 12px', fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)' }}>No matching airports</div>
              ) : pickerResults.map((r, i) => (
                <button key={r.icao} onClick={() => choosePickerAirport(r.icao)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                  background: 'transparent', border: 'none',
                  borderBottom: i < pickerResults.length - 1 ? '1px solid var(--cp-border)' : 'none',
                  padding: '9px 12px', cursor: 'pointer', textAlign: 'left',
                }}>
                  <div>
                    <div style={{ fontFamily: 'var(--cb-font-body)', fontSize: 13, color: 'var(--cp-txt)' }}>{r.icao} — {r.name}</div>
                    <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)' }}>{r.city}, {r.country}</div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--cp-dim)' }}>→</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPickerOpen(true)} style={{
              display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, textAlign: 'left',
              background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)', borderRadius: 6,
              padding: '7px 12px', cursor: 'pointer',
            }}>
              <span style={{ fontSize: 13, flexShrink: 0 }}>📍</span>
              <span style={{ fontFamily: 'var(--cb-font-body)', fontSize: 13, flex: 1, minWidth: 0, color: 'var(--cp-txt)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{centerLabel}</span>
              {centerMode === 'gps' && (
                <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 8, color: 'var(--cp-acc)', flexShrink: 0,
                  background: 'var(--cp-accdim)', border: '1px solid var(--cp-acc)', borderRadius: 3,
                  padding: '2px 5px', letterSpacing: '0.1em' }}>GPS</span>
              )}
            </button>
            <select value={radius} onChange={e => setRadius(Number(e.target.value))} style={{
              background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)', borderRadius: 6, flexShrink: 0,
              color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)', fontSize: 12, padding: '7px 8px', cursor: 'pointer',
            }}>
              <option value={25}>25 NM</option>
              <option value={50}>50 NM</option>
              <option value={100}>100 NM</option>
              <option value={250}>250 NM</option>
              <option value={500}>500 NM</option>
            </select>
          </div>
        )}
        {gpsError && (
          <div style={{ fontSize: 10, color: 'var(--cp-orange)', fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.06em', marginTop: 6 }}>
            {gpsError}
          </div>
        )}
      </div>

      {/* ── Radar map ── */}
      <RadarMap flights={globalSearch ? globalWithGeo : flightsWithGeo} selectedKey={selectedKey} centerLabel={centerMode === 'gps' ? 'GPS' : centerIcaoResolved} />

      {/* ── Table toolbar: search + display settings, right where they act ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input className="cp-input" style={{ flex: 1, minWidth: 160, fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
          placeholder={globalSearch ? '🌐 Search any callsign, anywhere in the world…' : '🔍 Search callsign, reg, flight # — comma for multiple'}
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        {searchQuery && (
          <button className="cp-btn" style={{ padding: '7px 10px', flexShrink: 0 }} onClick={() => setSearchQuery('')}>✕</button>
        )}
        <button title={globalSearch ? 'Searching worldwide — tap to search only within range' : 'Search worldwide instead of just within range'}
          onClick={() => setGlobalSearch(v => !v)} style={{
          width: 34, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: globalSearch ? 'var(--cp-accdim)' : 'transparent',
          border: `1px solid ${globalSearch ? 'var(--cp-acc)' : 'var(--cp-border)'}`, borderRadius: 6,
          color: globalSearch ? 'var(--cp-acc)' : 'var(--cp-dim)', cursor: 'pointer', fontSize: 15,
        }}>🌐</button>
        <button title="Show/Hide Fields" onClick={() => setFieldsOpen(true)} style={{
          width: 34, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: '1px solid var(--cp-border)', borderRadius: 6,
          color: 'var(--cp-dim)', cursor: 'pointer', fontSize: 15,
        }}>⚙</button>
      </div>

      {globalSearch && globalError && (
        <div style={{
          background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.25)',
          borderLeft: '3px solid var(--cp-red)', borderRadius: 4, padding: '8px 14px', marginBottom: 12,
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--cp-red)',
        }}>⚠ {globalError}</div>
      )}

      {/* ── Table ── */}
      {(globalSearch ? globalLoading : loading) ? (
        <div style={{ textAlign: 'center', color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)',
          fontSize: 11, letterSpacing: '0.1em', padding: '20px 0' }}>
          {globalSearch ? 'SEARCHING WORLDWIDE…' : 'LOADING TRAFFIC…'}
        </div>
      ) : Object.keys(filteredFlights).length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)',
          fontSize: 11, letterSpacing: '0.1em', padding: '20px 0' }}>
          {globalSearch
            ? (searchQuery.trim().length >= 2 ? 'NO MATCHING AIRCRAFT FOUND WORLDWIDE' : 'TYPE A CALLSIGN TO SEARCH WORLDWIDE')
            : (searchTerms.length ? 'NO MATCHING AIRCRAFT — CLEAR THE SEARCH TO SEE THE FULL LIST' : 'NO TRAFFIC WITHIN RANGE')}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="cp-table" style={{ minWidth: 480 }}>
            <thead><tr><th>Callsign</th>{activeRowFields.map(f => <th key={f.key}>{f.label}</th>)}</tr></thead>
            <tbody>
              {Object.entries(filteredFlights).map(([key, f]) => (
                <tr key={key} className={key === selectedKey ? 'active' : ''} style={{ cursor: 'pointer' }}
                  onClick={() => selectRow(key)}>
                  <td style={{ fontFamily: 'var(--cb-font-mono)', fontWeight: 700, padding: '7px 8px' }}>{f.callsign}</td>
                  {activeRowFields.map(fld => <RowCell key={fld.key} field={fld.key} f={f} now={now} status={detailsCache[key]?.flightStatus} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Flight status panel ── */}
      {selected && (
        <div style={{ marginTop: 16 }}>
          <FlightStatusPanel f={selected} cf={cf} now={now}
            lookup={selectedDetails?.lookup} airlineInfo={selectedDetails?.airlineInfo} performance={selectedDetails?.performance}
            flightStatus={selectedDetails?.flightStatus} detailsLoading={!!selectedDetails?.loading}
            pinging={pingingKey === selectedKey} onPing={() => pingFlight(selectedKey)} />
        </div>
      )}

      </div>

      {fieldsOpen && !isOffline && (
        <FieldsModal cf={cf} rf={rf}
          onToggleCard={(key, val) => updateSettings({ trafficFields: { ...settings.trafficFields, card: { ...cf, [key]: val } } })}
          onToggleRow={(key, val) => updateSettings({ trafficFields: { ...settings.trafficFields, row: { ...rf, [key]: val } } })}
          onClose={() => setFieldsOpen(false)} />
      )}
    </div>
  )
}

// ── Table cell ───────────────────────────────────────────────────────────────
function RowCell({ field, f, now, status }) {
  switch (field) {
    case 'registration':  return <td>{f.registration}</td>
    case 'icao24':        return <td>{f.icao24}</td>
    case 'aircraft_type': return <td>{f.aircraft_type}</td>
    case 'altitude': {
      const color = f.vertical_rate > 100 ? 'var(--cp-green)' : f.vertical_rate < -100 ? 'var(--cp-orange)' : 'var(--cp-dim)'
      const arrow = f.vertical_rate > 100 ? ' ↑' : f.vertical_rate < -100 ? ' ↓' : ''
      return <td style={{ color }}>{fmtAlt(f.altitude_ft)}{arrow}</td>
    }
    case 'ground_speed':  return <td>{f.ground_speed_kts}</td>
    case 'track':         return <td>{f.track}°</td>
    case 'vertical_rate': return <td>{f.vertical_rate > 0 ? '+' : ''}{f.vertical_rate} fpm</td>
    case 'squawk':        return <td>{f.squawk}</td>
    case 'on_ground':     return <td>{f.on_ground ? 'GND' : 'AIR'}</td>
    case 'route':         return <td>{f.airline || '—'}</td>
    case 'dist_brg':      return <td>{fmtDistBrg(f.distNm, f.brgDeg)}</td>
    case 'last_contact':  return <td>{fmtPinged(f.pingedAt, now)}</td>
    case 'status':        return <td>{status ? `${status.flight} ${status.status}` : '—'}</td>
    default: return <td />
  }
}

// ── Radar map ────────────────────────────────────────────────────────────────
// Past this many plotted contacts, callsign labels overlap into an unreadable
// mess — switch to a text summary and let the table (below) carry the load.
const CLUTTER_THRESHOLD = 60
const TICK_ANGLES = [30, 60, 120, 150, 210, 240, 300, 330]
function radarXY(distNm, brgDeg, cx, cy, rOuter, maxRangeNm) {
  const r = Math.max(10, Math.min(rOuter - 6, (distNm / maxRangeNm) * rOuter))
  const rad = brgDeg * Math.PI / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}
function RadarMap({ flights, selectedKey, centerLabel }) {
  const cx = 190, cy = 190, rOuter = 170, rIn = 162
  const withPos = Object.entries(flights).filter(([, f]) => f.distNm != null)
  const maxRangeNm = Math.max(20, ...withPos.map(([, f]) => f.distNm), 0)
  const selected = selectedKey ? flights[selectedKey] : null

  if (withPos.length > CLUTTER_THRESHOLD) {
    return (
      <div style={{ background: 'var(--cp-bg3)', borderRadius: 6, padding: '32px 20px', textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 12, letterSpacing: '0.1em', color: 'var(--cp-orange)', marginBottom: 6 }}>
          ⚠ {withPos.length} CONTACTS — TOO MANY TO PLOT
        </div>
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.04em' }}>
          Narrow the range for a radar view — the full list is in the table below
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--cp-bg3)', borderRadius: 6, padding: 14, display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
      <svg style={{ width: '100%', maxWidth: 360, height: 'auto' }} viewBox="-20 -20 420 420">
        <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke="var(--cp-border2)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r="110" fill="none" stroke="var(--cp-border2)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r="50" fill="none" stroke="var(--cp-border2)" strokeWidth="1" />
        <line x1={cx} y1="20" x2={cx} y2="360" stroke="var(--cp-border3)" strokeWidth="1" />
        <line x1="20" y1={cy} x2="360" y2={cy} stroke="var(--cp-border3)" strokeWidth="1" />
        {TICK_ANGLES.map(deg => {
          const rad = (deg - 90) * Math.PI / 180
          const x1 = cx + rIn * Math.cos(rad), y1 = cy + rIn * Math.sin(rad)
          const x2 = cx + rOuter * Math.cos(rad), y2 = cy + rOuter * Math.sin(rad)
          return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--cp-border2)" strokeWidth="1" />
        })}
        <text x={cx} y="6" fill="var(--cp-muted)" fontSize="12" fontWeight="700" fontFamily="var(--cb-font-mono)" textAnchor="middle">N</text>
        <text x={cx} y="384" fill="var(--cp-dim)" fontSize="12" fontWeight="700" fontFamily="var(--cb-font-mono)" textAnchor="middle">S</text>
        <text x="8" y="195" fill="var(--cp-dim)" fontSize="12" fontWeight="700" fontFamily="var(--cb-font-mono)" textAnchor="middle">W</text>
        <text x="372" y="195" fill="var(--cp-dim)" fontSize="12" fontWeight="700" fontFamily="var(--cb-font-mono)" textAnchor="middle">E</text>
        <circle cx={cx} cy={cy} r="4" fill="var(--cp-acc)" />
        <text x={cx + 8} y={cy + 4} fill="var(--cp-acc)" fontSize="10" fontFamily="var(--cb-font-mono)">{centerLabel}</text>
        {withPos.map(([key, f]) => {
          const color = f.vertical_rate > 100 ? 'var(--cp-green)' : f.vertical_rate < -100 ? 'var(--cp-orange)' : 'var(--cp-dim)'
          const { x, y } = radarXY(f.distNm, f.brgDeg, cx, cy, rOuter, maxRangeNm)
          return (
            <g key={key}>
              <g transform={`translate(${x},${y}) rotate(${f.track})`}><path d="M0,-9 L6,7 L0,4 L-6,7 Z" fill={color} /></g>
              <text x={x + 8} y={y - 4} fill={color} fontSize="9" fontFamily="var(--cb-font-mono)">{f.callsign}</text>
            </g>
          )
        })}
        {selected && selected.distNm != null && (() => {
          const p = radarXY(selected.distNm, selected.brgDeg, cx, cy, rOuter, maxRangeNm)
          return <circle cx={p.x} cy={p.y} r="15" fill="none" stroke="var(--cp-acc)"
            strokeWidth="2" strokeDasharray="3 3" style={{ animation: 'trafficSelPulse 1.1s ease-in-out infinite' }} />
        })()}
      </svg>
      <style>{'@keyframes trafficSelPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }'}</style>
    </div>
  )
}

// ── Flight status panel ─────────────────────────────────────────────────────
function FlightStatusPanel({ f, cf, now, lookup, airlineInfo, performance, flightStatus, detailsLoading, pinging, onPing }) {
  const subParts = []
  if (cf.registration) subParts.push(f.registration)
  if (cf.aircraft_type) subParts.push(f.aircraft_type)
  if (cf.icao24) subParts.push(`icao24 ${f.icao24}`)
  if (f.airline) subParts.push(f.airline)

  const liveParts = []
  if (cf.altitude) liveParts.push(fmtAlt(f.altitude_ft))
  if (cf.ground_speed) liveParts.push(`${f.ground_speed_kts} kts`)
  if (cf.track) liveParts.push(`trk ${f.track}°`)
  if (cf.vertical_rate) liveParts.push(fmtVs(f.vertical_rate))
  if (cf.squawk) liveParts.push(`sqk ${f.squawk}`)
  if (cf.on_ground) liveParts.push(f.on_ground ? 'ON GROUND' : 'AIRBORNE')

  const lookupLine2 = [], lookupLine3 = []
  let anyLookup = false
  const showLogo = cf.operator && !!airlineInfo?.logo
  if (lookup) {
    if (cf.manufacturer && lookup.manufacturer) lookupLine2.push(lookup.manufacturer)
    if (cf.operator && lookup.operator) lookupLine2.push(lookup.operator + (cf.operator_icao && lookup.operator_icao ? ` (${lookup.operator_icao})` : ''))
    if (cf.operator_iata && airlineInfo?.iata) lookupLine2.push(airlineInfo.iata)
    if (cf.country && airlineInfo?.country) lookupLine2.push(airlineInfo.country)
    if (cf.engine_type && performance?.engineType) {
      lookupLine3.push(performance.engineCode ? `${performance.engineType} (${performance.engineCode})` : performance.engineType)
    }
    if (cf.wake_category && performance?.wakeCategory) lookupLine3.push(`wake ${fmtWakeCategory(performance.wakeCategory)}`)
    if (cf.cruise_speed && performance?.cruiseSpeedKt) lookupLine3.push(`${performance.cruiseSpeedKt} kt cruise`)
    if (cf.max_range && performance?.maxRangeNm) lookupLine3.push(`${performance.maxRangeNm.toLocaleString()} NM range`)
    if (cf.service_ceiling && performance?.serviceCeilingFt) lookupLine3.push(`${fmtAlt(performance.serviceCeilingFt)} ceiling`)
    if (cf.wingspan && performance?.wingSpanM) lookupLine3.push(`${performance.wingSpanM} m span`)
    if (cf.length && performance?.lengthM) lookupLine3.push(`${performance.lengthM} m long`)
    if (cf.mtow && performance?.mtowT) lookupLine3.push(`MTOW ${performance.mtowT} t`)
    if (cf.year_manufactured && lookup.year_manufactured) lookupLine3.push(`built ${lookup.year_manufactured}`)
    if (cf.serial_number && lookup.serial_number) lookupLine3.push(`s/n ${lookup.serial_number}`)
    anyLookup = (cf.type_name && lookup.type_name) || lookupLine2.length || lookupLine3.length
  }

  const statusGrid = []
  if (flightStatus) {
    if (cf.flight_number) statusGrid.push(['Flight', flightStatus.flight])
    if (flightStatus.route) statusGrid.push(['Route', flightStatus.route])
    if (cf.airline && flightStatus.airline) statusGrid.push(['Airline', flightStatus.airline])
    if (cf.scheduled) {
      if (flightStatus.schedDep) statusGrid.push(['Sched Dep', flightStatus.schedDep])
      if (flightStatus.schedArr) statusGrid.push(['Sched Arr', flightStatus.schedArr])
    }
    if (cf.estimated && flightStatus.estArr) statusGrid.push(['Est Arr', flightStatus.estArr])
    if (cf.delay) {
      const delayLabel = fmtDelay(flightStatus.delayMinutes)
      if (delayLabel) statusGrid.push(['Delay', <span style={{ color: flightStatus.delayMinutes > 0 ? 'var(--cp-orange)' : 'var(--cp-txt)' }}>{delayLabel}</span>])
    }
    if (cf.status) statusGrid.push(['Status', <span style={{ color: flightStatus.statusColor }}>{flightStatus.status}</span>])
  }

  return (
    <div className="cp-card-accent">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--cp-acc)', letterSpacing: '0.06em' }}>{f.callsign}</div>
          {subParts.length > 0 && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginTop: 2 }}>{subParts.join(' · ')}</div>}
        </div>
        <button className="cp-btn" style={{ fontSize: 10, padding: '5px 12px', flexShrink: 0 }} disabled={pinging} onClick={onPing}>
          {pinging ? 'PINGING…' : '⟳ PING'}
        </button>
      </div>
      {liveParts.length > 0 && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 12, color: 'var(--cp-txt)', marginBottom: 4 }}>{liveParts.join(' · ')}</div>}
      {cf.pinged && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)' }}>{fmtPinged(f.pingedAt, now)}</div>}

      {detailsLoading && (
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginTop: 10 }}>Loading aircraft info…</div>
      )}

      {!detailsLoading && (
        <>
          <div style={{ borderTop: '1px solid var(--cp-border3)', margin: '12px 0' }} />
          {statusGrid.length > 0
            ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px 16px' }}>
                {statusGrid.map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 3 }}>{k}</div>
                    <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, color: 'var(--cp-txt)' }}>{v}</div>
                  </div>
                ))}
              </div>
            : <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', lineHeight: 1.6 }}>
                No matching SkyLink flight_status record for this callsign (private/VFR traffic, or not currently scheduled).
              </div>}

          {anyLookup && (
            <>
              <div style={{ borderTop: '1px solid var(--cp-border3)', margin: '12px 0' }} />
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 6, background: 'var(--cp-bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--cp-dim)', overflow: 'hidden' }}>
                  {showLogo && (
                    <img src={airlineInfo.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling.style.display = 'block' }} />
                  )}
                  <span style={{ display: showLogo ? 'none' : 'block' }}>✈</span>
                </div>
                <div>
                  {cf.type_name && lookup.type_name && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--cp-txt)' }}>{lookup.type_name}</div>}
                  {lookupLine2.length > 0 && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginTop: 2 }}>{lookupLine2.join(' · ')}</div>}
                  {lookupLine3.length > 0 && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginTop: 2 }}>{lookupLine3.join(' · ')}</div>}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Show/Hide Fields modal ──────────────────────────────────────────────────
function FieldGroup({ title, fields, state, onToggle }) {
  return (
    <>
      <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cp-dim)', margin: '12px 0 6px' }}>{title}</div>
      {fields.map(f => (
        <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!state[f.key]} onChange={e => onToggle(f.key, e.target.checked)} style={{ accentColor: 'var(--cp-acc)', cursor: 'pointer' }} />
          {f.label}
        </label>
      ))}
    </>
  )
}

function FieldsModal({ cf, rf, onToggleCard, onToggleRow, onClose }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20,
    }}>
      <div style={{
        background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)', borderRadius: 8,
        width: 520, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--cp-border)', position: 'sticky', top: 0, background: 'var(--cp-bg2)' }}>
          <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cp-acc)' }}>Show/Hide Fields</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--cp-dim)', fontSize: 16, cursor: 'pointer', padding: '2px 6px' }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 28, padding: '16px 20px 20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <FieldGroup title="Info card — Live position" fields={CARD_FIELDS.filter(f => f.group === 'live')} state={cf} onToggle={onToggleCard} />
            <FieldGroup title="Info card — Aircraft lookup" fields={CARD_FIELDS.filter(f => f.group === 'lookup')} state={cf} onToggle={onToggleCard} />
            <FieldGroup title="Info card — Flight status" fields={CARD_FIELDS.filter(f => f.group === 'status')} state={cf} onToggle={onToggleCard} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <FieldGroup title="Table row columns" fields={ROW_FIELDS} state={rf} onToggle={onToggleRow} />
          </div>
        </div>
      </div>
    </div>
  )
}
