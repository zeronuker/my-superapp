import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { haptic } from '../utils/haptic'
import { lookupAirport, searchAirports } from '../data/airports'
import { distanceNm, bearingDeg } from '../utils/geo'
import {
  fmtAlt, fmtVs, fmtPinged, fmtDistBrg, fmtSpeed, fmtTrack, fmtDelay, fmtWakeCategory,
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
  { key: 'dist_brg',         label: 'Distance/Bearing',      group: 'live' },
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
// ── Fetch helpers — thin wrappers over the unified /api/skylink proxy ──
// Response is { aircraft: [...], total_count, timestamp } — not a bare array.
async function fetchTraffic(lat, lon, radiusNm, signal) {
  const params = new URLSearchParams({ resource: 'adsb', lat, lon, radius: radiusNm })
  const res = await fetch(`/api/skylink?${params}`, { signal })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
  return Array.isArray(body?.aircraft) ? body.aircraft : []
}
async function pingAircraft(icao24, signal) {
  const params = new URLSearchParams({ resource: 'adsb', icao24 })
  const res = await fetch(`/api/skylink?${params}`, { signal })
  if (!res.ok) return null
  const body = await res.json().catch(() => null)
  return body?.aircraft?.[0] ?? null
}
// Global search — no lat/lon, searches the whole live feed by callsign.
async function fetchByCallsign(callsign, signal) {
  const params = new URLSearchParams({ resource: 'adsb', callsign })
  const res = await fetch(`/api/skylink?${params}`, { signal })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
  return Array.isArray(body?.aircraft) ? body.aircraft : []
}
async function fetchAircraftLookup(registration, icao24, signal) {
  const params = new URLSearchParams({ resource: 'aircraft', ...(registration && registration !== '—' ? { registration } : { icao24 }) })
  const res = await fetch(`/api/skylink?${params}`, { signal })
  if (!res.ok) return null
  return res.json().catch(() => null)
}
async function fetchFlightStatus(flightOrCallsign, signal) {
  const params = new URLSearchParams({ resource: 'flight-status', flight: flightOrCallsign })
  const res = await fetch(`/api/skylink?${params}`, { signal })
  if (!res.ok) return null
  return res.json().catch(() => null)
}
async function fetchAirlineInfo(icaoCode, signal) {
  const params = new URLSearchParams({ resource: 'airlines', icao: icaoCode })
  const res = await fetch(`/api/skylink?${params}`, { signal })
  if (!res.ok) return null
  return res.json().catch(() => null)
}
async function fetchAircraftPerformance(icaoType, signal) {
  const params = new URLSearchParams({ resource: 'aircraft-performance', icao_type: icaoType })
  const res = await fetch(`/api/skylink?${params}`, { signal })
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
  // Auto-fallback animation: 'banner' (transition text) then 'pulse' (globe icon), then null.
  const [fallbackPhase, setFallbackPhase] = useState(null)
  const [autoFallbackQuery, setAutoFallbackQuery] = useState(null)
  const fallbackTimersRef = useRef([])
  useEffect(() => () => fallbackTimersRef.current.forEach(clearTimeout), [])

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

  // Comma-separated terms — an aircraft matches if ANY term matches ANY of callsign/reg/flight#.
  // In "search anywhere" mode the server already filtered by callsign (first term only,
  // that's all the API takes), so the local list is shown as-is rather than re-filtered.
  const searchTerms = searchQuery.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
  const localFilteredFlights = searchTerms.length
    ? Object.fromEntries(Object.entries(flightsWithGeo).filter(([key, f]) => {
        const status = detailsCache[key]?.flightStatus
        return searchTerms.some(term =>
          f.callsign.includes(term) || f.registration.includes(term) || (status?.flight && status.flight.includes(term)))
      }))
    : flightsWithGeo
  const filteredFlights = globalSearch ? globalWithGeo : localFilteredFlights
  const selectedDetails = selectedKey ? detailsCache[selectedKey] : null
  const selected = selectedKey ? flightsWithGeo[selectedKey] : null

  // Auto-fallback to global search once the local (within-range) search comes
  // up empty — same toggle the globe button controls, so it stays overridable
  // (and the button visually reflects it). Guarded to fire once per distinct
  // query string, so manually switching back off doesn't immediately re-fire.
  useEffect(() => {
    if (globalSearch || isOffline || loading) return
    const firstTerm = searchQuery.split(',')[0].trim()
    if (firstTerm.length < 2) return
    if (Object.keys(localFilteredFlights).length > 0) return
    if (autoFallbackQuery === searchQuery) return
    setAutoFallbackQuery(searchQuery)
    setGlobalSearch(true)
    fallbackTimersRef.current.forEach(clearTimeout)
    setFallbackPhase('banner')
    const t1 = setTimeout(() => setFallbackPhase('pulse'), 1300)
    const t2 = setTimeout(() => setFallbackPhase(null), 2600)
    fallbackTimersRef.current = [t1, t2]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, globalSearch, isOffline, loading])

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
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '360px auto', gap: 12 }}>

        {/* ── Top-left: range view ── */}
        <div style={{ gridColumn: 1, gridRow: 1, minWidth: 0 }}>
          <RangeView flights={globalSearch ? globalWithGeo : flightsWithGeo} selectedKey={selectedKey}
            centerLabel={centerMode === 'gps' ? 'GPS' : centerIcaoResolved} rangeNm={radius} />
        </div>

        {/* ── Top-right: center / range / search, then results ── */}
        <div style={{ gridColumn: 2, gridRow: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, minHeight: 0 }}>

          <div>
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

            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <input className="cp-input" style={{ flex: 1, minWidth: 120, fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                placeholder={globalSearch ? '🌐 Search callsign, anywhere…' : '🔍 Search callsign, reg, flight #'}
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              {searchQuery && (
                <button className="cp-btn" style={{ padding: '7px 10px', flexShrink: 0 }} onClick={() => setSearchQuery('')}>✕</button>
              )}
              <button title={globalSearch ? 'Searching worldwide — tap to search only within range' : 'Search worldwide instead of just within range'}
                onClick={() => { fallbackTimersRef.current.forEach(clearTimeout); setFallbackPhase(null); setGlobalSearch(v => !v) }} style={{
                width: 34, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: globalSearch ? 'var(--cp-accdim)' : 'transparent',
                border: `1px solid ${globalSearch ? 'var(--cp-acc)' : 'var(--cp-border)'}`, borderRadius: 6,
                color: globalSearch ? 'var(--cp-acc)' : 'var(--cp-dim)', cursor: 'pointer', fontSize: 15,
                animation: fallbackPhase === 'pulse' ? 'trafficGlobePulse 0.6s ease-in-out 2' : 'none',
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
                borderLeft: '3px solid var(--cp-red)', borderRadius: 4, padding: '8px 14px', marginTop: 8,
                fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--cp-red)',
              }}>⚠ {globalError}</div>
            )}
          </div>

          {/* ── Results ── */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--cp-bg3)', borderRadius: 6, padding: 8 }}>
            {fallbackPhase === 'banner' && (
              <div style={{
                textAlign: 'center', fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.1em',
                color: 'var(--cp-acc)', padding: '4px 0 8px', animation: 'trafficFallbackFade 1.3s ease-in-out',
              }}>
                → EXPANDING SEARCH WORLDWIDE…
              </div>
            )}
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
              <table className="cp-table" style={{ width: '100%' }}>
                <thead><tr><th>Callsign</th><th>Reg</th><th>Type</th></tr></thead>
                <tbody>
                  {Object.entries(filteredFlights).map(([key, f]) => (
                    <tr key={key} className={key === selectedKey ? 'active' : ''} style={{ cursor: 'pointer' }}
                      onClick={() => selectRow(key)}>
                      <td style={{ fontFamily: 'var(--cb-font-mono)', fontWeight: 700, padding: '7px 8px' }}>{f.callsign}</td>
                      <td>{f.registration}</td>
                      <td>{f.aircraft_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <style>{`
          @keyframes trafficFallbackFade { 0% { opacity: 0; } 15%, 70% { opacity: 1; } 100% { opacity: 0; } }
          @keyframes trafficGlobePulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.22); } }
        `}</style>

        {/* ── Bottom-center: aircraft/flight details ── */}
        <div style={{ gridColumn: '1 / span 2', gridRow: 2, minWidth: 0 }}>
          {selected ? (
            <FlightStatusPanel f={selected} cf={cf} now={now}
              lookup={selectedDetails?.lookup} airlineInfo={selectedDetails?.airlineInfo} performance={selectedDetails?.performance}
              flightStatus={selectedDetails?.flightStatus} detailsLoading={!!selectedDetails?.loading}
              pinging={pingingKey === selectedKey} onPing={() => pingFlight(selectedKey)} />
          ) : (
            <div className="cp-card-accent" style={{ textAlign: 'center', color: 'var(--cp-dim)',
              fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.1em' }}>
              SELECT AN AIRCRAFT FROM THE RESULTS TO VIEW DETAILS
            </div>
          )}
        </div>

      </div>

      </div>

      {fieldsOpen && !isOffline && (
        <FieldsModal cf={cf}
          onToggleCard={(key, val) => updateSettings({ trafficFields: { ...settings.trafficFields, card: { ...cf, [key]: val } } })}
          onToggleAllCard={(keys, val) => updateSettings({ trafficFields: { ...settings.trafficFields, card: { ...cf, ...Object.fromEntries(keys.map(k => [k, val])) } } })}
          onClose={() => setFieldsOpen(false)} />
      )}
    </div>
  )
}

// ── Range view — square, fills its pane edge-to-edge ───────────────────────
// Past this many plotted contacts, callsign labels overlap into an unreadable
// mess — switch to a text summary and let the results list carry the load.
const CLUTTER_THRESHOLD = 60
// CSS-percentage position within the square, center-anchored. maxRangeNm always
// covers the farthest plotted contact, so r <= 1 and the offset never exceeds HALF.
const HALF = 44
function squareXY(distNm, brgDeg, maxRangeNm) {
  const r = Math.min(1, distNm / maxRangeNm)
  const rad = brgDeg * Math.PI / 180
  return { left: 50 + Math.sin(rad) * r * HALF, top: 50 - Math.cos(rad) * r * HALF }
}
function RangeView({ flights, selectedKey, centerLabel, rangeNm }) {
  const withPos = Object.entries(flights).filter(([, f]) => f.distNm != null)
  const maxRangeNm = Math.max(20, ...withPos.map(([, f]) => f.distNm), 0)
  const selected = selectedKey ? flights[selectedKey] : null

  if (withPos.length > CLUTTER_THRESHOLD) {
    return (
      <div style={{ background: 'var(--cp-bg3)', borderRadius: 6, height: '100%', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 }}>
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 12, letterSpacing: '0.1em', color: 'var(--cp-orange)', marginBottom: 6 }}>
          ⚠ {withPos.length} CONTACTS — TOO MANY TO PLOT
        </div>
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.04em' }}>
          Narrow the range for a plot — the full list is in the results pane
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'relative', height: '100%', border: '1px solid var(--cp-border2)', borderRadius: 6, overflow: 'hidden',
      backgroundColor: 'var(--cp-bg3)',
      backgroundImage: 'linear-gradient(var(--cp-border3) 1px, transparent 1px), linear-gradient(90deg, var(--cp-border3) 1px, transparent 1px)',
      backgroundSize: '25% 25%',
    }}>
      <div style={{ position: 'absolute', top: 8, left: 10, fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--cp-dim)' }}>
        {rangeNm} NM
      </div>
      <div style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--cb-font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--cp-muted)' }}>N</div>
      <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--cb-font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--cp-dim)' }}>S</div>
      <div style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--cb-font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--cp-dim)' }}>W</div>
      <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontFamily: 'var(--cb-font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--cp-dim)' }}>E</div>

      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 8, height: 8, borderRadius: '50%', background: 'var(--cp-acc)' }} />
      <div style={{ position: 'absolute', left: 'calc(50% + 8px)', top: 'calc(50% - 6px)', fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-acc)' }}>{centerLabel}</div>

      {withPos.map(([key, f]) => {
        const color = f.vertical_rate > 100 ? 'var(--cp-green)' : f.vertical_rate < -100 ? 'var(--cp-orange)' : 'var(--cp-dim)'
        const { left, top } = squareXY(f.distNm, f.brgDeg, maxRangeNm)
        return (
          <div key={key} style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, transform: 'translate(-50%,-50%)' }}>
            <div style={{
              width: 0, height: 0, transform: `rotate(${f.track}deg)`,
              borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: `9px solid ${color}`,
            }} />
            <span style={{ position: 'absolute', left: 8, top: -4, whiteSpace: 'nowrap', fontFamily: 'var(--cb-font-mono)', fontSize: 9, color }}>{f.callsign}</span>
          </div>
        )
      })}

      {selected && selected.distNm != null && (() => {
        const { left, top } = squareXY(selected.distNm, selected.brgDeg, maxRangeNm)
        return <div style={{
          position: 'absolute', left: `${left}%`, top: `${top}%`, transform: 'translate(-50%,-50%)',
          width: 26, height: 26, borderRadius: '50%', border: '2px dashed var(--cp-acc)',
          animation: 'trafficSelPulse 1.1s ease-in-out infinite',
        }} />
      })()}
      <style>{'@keyframes trafficSelPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }'}</style>
    </div>
  )
}

// ── Flight status panel — wrapping grid, one labeled cell per checked field ──
function FieldGrid({ items }) {
  if (items.length === 0) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '10px 16px' }}>
      {items.map(([k, v]) => (
        <div key={k}>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 3 }}>{k}</div>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, color: 'var(--cp-txt)' }}>{v}</div>
        </div>
      ))}
    </div>
  )
}
function GroupLabel({ children }) {
  return <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 8 }}>{children}</div>
}

function FlightStatusPanel({ f, cf, now, lookup, airlineInfo, performance, flightStatus, detailsLoading, pinging, onPing }) {
  const subParts = []
  if (cf.registration) subParts.push(f.registration)
  if (cf.aircraft_type) subParts.push(f.aircraft_type)
  if (cf.icao24) subParts.push(`icao24 ${f.icao24}`)
  if (f.airline) subParts.push(f.airline)

  const liveItems = []
  if (cf.altitude) liveItems.push(['Alt', fmtAlt(f.altitude_ft)])
  if (cf.ground_speed) liveItems.push(['GS', fmtSpeed(f.ground_speed_kts)])
  if (cf.track) liveItems.push(['Trk', fmtTrack(f.track)])
  if (cf.vertical_rate) liveItems.push(['V/S', fmtVs(f.vertical_rate)])
  if (cf.squawk) liveItems.push(['Squawk', f.squawk])
  if (cf.on_ground) liveItems.push(['On ground', f.on_ground ? 'ON GROUND' : 'AIRBORNE'])
  if (cf.dist_brg) liveItems.push(['Dist/Brg', fmtDistBrg(f.distNm, f.brgDeg)])

  const lookupItems = []
  let showLogo = false
  if (lookup) {
    if (cf.manufacturer && lookup.manufacturer) lookupItems.push(['Manufacturer', lookup.manufacturer])
    if (cf.operator && lookup.operator) lookupItems.push(['Operator', lookup.operator + (cf.operator_icao && lookup.operator_icao ? ` (${lookup.operator_icao})` : '')])
    if (cf.operator_iata && airlineInfo?.iata) lookupItems.push(['Operator IATA', airlineInfo.iata])
    if (cf.country && airlineInfo?.country) lookupItems.push(['Country', airlineInfo.country])
    if (cf.engine_type && performance?.engineType) {
      lookupItems.push(['Engine', performance.engineCode ? `${performance.engineType} (${performance.engineCode})` : performance.engineType])
    }
    if (cf.wake_category && performance?.wakeCategory) lookupItems.push(['Wake', fmtWakeCategory(performance.wakeCategory)])
    if (cf.cruise_speed && performance?.cruiseSpeedKt) lookupItems.push(['Cruise', `${performance.cruiseSpeedKt} kt`])
    if (cf.max_range && performance?.maxRangeNm) lookupItems.push(['Max range', `${performance.maxRangeNm.toLocaleString()} NM`])
    if (cf.service_ceiling && performance?.serviceCeilingFt) lookupItems.push(['Ceiling', fmtAlt(performance.serviceCeilingFt)])
    if (cf.wingspan && performance?.wingSpanM) lookupItems.push(['Wingspan', `${performance.wingSpanM} m`])
    if (cf.length && performance?.lengthM) lookupItems.push(['Length', `${performance.lengthM} m`])
    if (cf.mtow && performance?.mtowT) lookupItems.push(['MTOW', `${performance.mtowT} t`])
    if (cf.year_manufactured && lookup.year_manufactured) lookupItems.push(['Built', lookup.year_manufactured])
    if (cf.serial_number && lookup.serial_number) lookupItems.push(['S/N', lookup.serial_number])
    showLogo = cf.operator && !!airlineInfo?.logo
  }
  const showTypeName = !!(lookup && cf.type_name && lookup.type_name)

  const statusItems = []
  if (flightStatus) {
    if (cf.flight_number) statusItems.push(['Flight', flightStatus.flight])
    if (flightStatus.route) statusItems.push(['Route', flightStatus.route])
    if (cf.airline && flightStatus.airline) statusItems.push(['Airline', flightStatus.airline])
    if (cf.scheduled) {
      if (flightStatus.schedDep) statusItems.push(['Sched Dep', flightStatus.schedDep])
      if (flightStatus.schedArr) statusItems.push(['Sched Arr', flightStatus.schedArr])
    }
    if (cf.estimated && flightStatus.estArr) statusItems.push(['Est Arr', flightStatus.estArr])
    if (cf.delay) {
      const delayLabel = fmtDelay(flightStatus.delayMinutes)
      if (delayLabel) statusItems.push(['Delay', <span style={{ color: flightStatus.delayMinutes > 0 ? 'var(--cp-orange)' : 'var(--cp-txt)' }}>{delayLabel}</span>])
    }
    if (cf.status) statusItems.push(['Status', <span style={{ color: flightStatus.statusColor }}>{flightStatus.status}</span>])
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
      {cf.pinged && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)' }}>{fmtPinged(f.pingedAt, now)}</div>}

      {liveItems.length > 0 && (
        <>
          <div style={{ borderTop: '1px solid var(--cp-border3)', margin: '12px 0' }} />
          <GroupLabel>Live position</GroupLabel>
          <FieldGrid items={liveItems} />
        </>
      )}

      {detailsLoading && (
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginTop: 10 }}>Loading aircraft info…</div>
      )}

      {!detailsLoading && (
        <>
          <div style={{ borderTop: '1px solid var(--cp-border3)', margin: '12px 0' }} />
          <GroupLabel>Flight status</GroupLabel>
          {statusItems.length > 0
            ? <FieldGrid items={statusItems} />
            : <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', lineHeight: 1.6 }}>
                No matching SkyLink flight_status record for this callsign (private/VFR traffic, or not currently scheduled).
              </div>}

          {(showTypeName || lookupItems.length > 0) && (
            <>
              <div style={{ borderTop: '1px solid var(--cp-border3)', margin: '12px 0' }} />
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {showLogo && (
                  <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 6, background: 'var(--cp-bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <img src={airlineInfo.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={e => { e.currentTarget.style.display = 'none' }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <GroupLabel>Aircraft lookup</GroupLabel>
                  {showTypeName && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--cp-txt)', marginBottom: 8 }}>{lookup.type_name}</div>}
                  <FieldGrid items={lookupItems} />
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
function FieldGroup({ title, fields, state, onToggle, onToggleAll }) {
  const allChecked = fields.every(f => !!state[f.key])
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 6px' }}>
        <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cp-dim)' }}>{title}</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.08em', color: 'var(--cp-dim)', cursor: 'pointer' }}>
          <input type="checkbox" checked={allChecked} onChange={e => onToggleAll(fields.map(f => f.key), e.target.checked)} style={{ accentColor: 'var(--cp-acc)', cursor: 'pointer' }} />
          SELECT ALL
        </label>
      </div>
      {fields.map(f => (
        <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!state[f.key]} onChange={e => onToggle(f.key, e.target.checked)} style={{ accentColor: 'var(--cp-acc)', cursor: 'pointer' }} />
          {f.label}
        </label>
      ))}
    </>
  )
}

function FieldsModal({ cf, onToggleCard, onToggleAllCard, onClose }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20,
    }}>
      <div style={{
        background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)', borderRadius: 8,
        width: 340, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--cp-border)', position: 'sticky', top: 0, background: 'var(--cp-bg2)' }}>
          <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cp-acc)' }}>Show/Hide Fields</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--cp-dim)', fontSize: 16, cursor: 'pointer', padding: '2px 6px' }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px 20px' }}>
          <FieldGroup title="Live position" fields={CARD_FIELDS.filter(f => f.group === 'live')} state={cf} onToggle={onToggleCard} onToggleAll={onToggleAllCard} />
          <FieldGroup title="Aircraft lookup" fields={CARD_FIELDS.filter(f => f.group === 'lookup')} state={cf} onToggle={onToggleCard} onToggleAll={onToggleAllCard} />
          <FieldGroup title="Flight status" fields={CARD_FIELDS.filter(f => f.group === 'status')} state={cf} onToggle={onToggleCard} onToggleAll={onToggleAllCard} />
        </div>
      </div>
    </div>
  )
}
