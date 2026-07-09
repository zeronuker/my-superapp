import React, { useState, useMemo, useCallback } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { haptic } from '../utils/haptic'
import { lookupAirport } from '../data/airports'
import { distanceNm, bearingDeg } from '../utils/geo'
import ResetButton from './ResetButton'

// ── Fallback anchor when no center is resolvable yet (empty input, unknown
// ICAO, GPS not granted) — Kuala Lumpur Intl, keeps the demo non-empty. ──
const FALLBACK_ANCHOR = { lat: 2.7456, lng: 101.7099 }

// ── Mock traffic — fictional airlines/registrations so this preview can never
// be mistaken for real live data. `offset` is degrees from the chosen center
// (used for the real distance/bearing math); `screenPos` is a fixed decorative
// position on the radar (the map is schematic, not to scale). ──
const MOCK_FLIGHTS = {
  brn804: {
    callsign: 'BRN804', registration: '9M-XBA', icao24: '7c1a02', aircraft_type: 'B738',
    offset: { dLat: 0.55, dLon: 1.35 }, screenPos: { x: 230, y: 140 },
    altitude_ft: 9000, ground_speed_kts: 280, track: 152, vertical_rate: -1200, squawk: '2413', on_ground: false,
    pingedAt: null,
    lookup: { type_name: 'Boeing 737-800', manufacturer: 'Boeing', operator: 'Borne Air', operator_icao: 'BRN', operator_iata: 'B8', country: 'Malaysia', engines: 2, engine_type: 'Turbofan', year_manufactured: 2016, serial_number: '41588', military: false },
    flightStatus: { flight: 'B8804', airline: 'BRN · B8', route: 'WMKK → VHHH', status: 'ACTIVE', statusColor: 'var(--cp-acc)', schedDep: '0900Z', schedArr: '1215Z', estArr: '1221Z', delay: '+6 min', delayColor: 'var(--cp-orange)' },
  },
  skl212: {
    callsign: 'SKL212', registration: '9M-XSK', icao24: '7c2b13', aircraft_type: 'A320',
    offset: { dLat: -1.1, dLon: -1.3 }, screenPos: { x: 90, y: 110 },
    altitude_ft: 14000, ground_speed_kts: 310, track: 210, vertical_rate: 1800, squawk: '5120', on_ground: false,
    pingedAt: null,
    lookup: { type_name: 'Airbus A320-200', manufacturer: 'Airbus', operator: 'Skyline Air', operator_icao: 'SKL', operator_iata: 'K9', country: 'Malaysia', engines: 2, engine_type: 'Turbofan', year_manufactured: 2014, serial_number: '6053', military: false },
    flightStatus: { flight: 'K9212', airline: 'SKL · K9', route: 'WMKK → RPLL', status: 'SCHEDULED', statusColor: 'var(--cp-acc2)', schedDep: '1145Z', schedArr: '1450Z', estArr: '1450Z', delay: 'On time', delayColor: 'var(--cp-acc)' },
  },
  n77zz: {
    callsign: 'N77ZZ', registration: 'N77ZZ', icao24: 'a1e2f3', aircraft_type: 'C172',
    offset: { dLat: -0.05, dLon: 0.05 }, screenPos: { x: 210, y: 260 },
    altitude_ft: 2500, ground_speed_kts: 95, track: 330, vertical_rate: 0, squawk: '1200', on_ground: false,
    pingedAt: null,
    lookup: { type_name: 'Cessna 172 Skyhawk', manufacturer: 'Cessna', operator: 'Private', operator_icao: null, operator_iata: null, country: 'United States', engines: 1, engine_type: 'Piston', year_manufactured: 2005, serial_number: '17280492', military: false },
    flightStatus: null,
    note: 'GA aircraft — no matching flight_status record (private/VFR traffic, callsign not in schedules).',
  },
}

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
  { key: 'country',          label: 'Country',               group: 'lookup' },
  { key: 'engines',          label: 'Engines / engine type', group: 'lookup' },
  { key: 'year_manufactured',label: 'Year built',            group: 'lookup' },
  { key: 'serial_number',    label: 'Serial number',         group: 'lookup' },
  { key: 'military',         label: 'Military/govt flag',    group: 'lookup' },
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
  { key: 'route',         label: 'Route' },
  { key: 'dist_brg',      label: 'Dist/Brg' },
  { key: 'last_contact',  label: 'Age' },
  { key: 'status',        label: 'Status' },
]

// ── Formatting helpers (local — same convention as formatAge in METARTAFCalculator) ──
function fmtAlt(ft) { return ft >= 18000 ? `FL${Math.round(ft / 100)}` : `${ft.toLocaleString()} ft` }
function fmtVs(vr) { return vr > 100 ? `↑ ${vr} fpm` : vr < -100 ? `↓ ${Math.abs(vr)} fpm` : 'level' }
function fmtPinged(ts, nowMs) {
  if (!ts) return 'Not pinged yet'
  const s = Math.max(0, Math.round((nowMs - ts) / 1000))
  return s < 1 ? 'Just pinged' : `Pinged ${s}s ago`
}
function fmtDistBrg(distNm, brgDeg) {
  return `${Math.round(distNm)} NM · ${String(Math.round(brgDeg)).padStart(3, '0')}°`
}

// ── Read the sibling METAR/TAF module's cached airports for quick-pick chips ──
function readMetarAirports() {
  try {
    const raw = localStorage.getItem('cb-metar-cache')
    if (!raw) return []
    const c = JSON.parse(raw)
    const list = []
    const add = (icao, label) => { if (icao?.trim()) list.push({ icao: icao.trim().toUpperCase(), label }) }
    add(c.dep, 'DEP')
    add(c.arr, 'ARR')
    add(c.destAlts?.alt1, 'ALT1')
    add(c.destAlts?.alt2, 'ALT2')
    for (let i = 0; i < (c.enrouteCount || 0); i++) add(c.enrouteAlts?.[i], `ERA${i + 1}`)
    return list
  } catch (_) { return [] }
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
  const [flights, setFlights] = useState(MOCK_FLIGHTS)
  const [selectedKey, setSelectedKey] = useState(null)
  const [pingingKey, setPingingKey] = useState(null)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [now, setNow] = useState(Date.now())

  const quickPicks = useMemo(readMetarAirports, [])

  const handleReset = () => {
    setCenterIcao(''); setCenterMode('icao'); setGpsCoords(null); setGpsError('')
    setRadius(50); setSelectedKey(null)
  }

  const handleGps = () => {
    if (!navigator.geolocation) { setGpsError('Geolocation not available on this device'); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setCenterMode('gps'); setGpsError('')
      },
      () => setGpsError('Location permission denied — using default center'),
    )
  }

  const setQuickPick = (icao) => {
    setCenterIcao(icao); setCenterMode('icao')
  }

  // ── Resolve the active center → anchor lat/lng, then compute real dist/bearing
  // for each mock aircraft against it (the numbers are real, the aircraft aren't) ──
  const centerAirport = centerMode === 'icao' && centerIcao.trim().length >= 3
    ? lookupAirport(centerIcao) : null
  const anchor = centerMode === 'gps' && gpsCoords
    ? gpsCoords
    : (centerAirport ? { lat: centerAirport.lat, lng: centerAirport.lng } : FALLBACK_ANCHOR)
  const centerLabel = centerMode === 'gps' && gpsCoords
    ? 'My GPS Location'
    : (centerIcao.trim() || (centerAirport ? centerIcao : 'WMKK (default)'))

  const flightsWithGeo = useMemo(() => {
    return Object.fromEntries(Object.entries(flights).map(([key, f]) => {
      const lat = anchor.lat + f.offset.dLat, lng = anchor.lng + f.offset.dLon
      return [key, { ...f, lat, lng, distNm: distanceNm(anchor.lat, anchor.lng, lat, lng), brgDeg: bearingDeg(anchor.lat, anchor.lng, lat, lng) }]
    }))
  }, [flights, anchor.lat, anchor.lng])

  const pingFlight = useCallback((key) => {
    setPingingKey(key)
    setTimeout(() => {
      setFlights(prev => {
        const f = prev[key]
        const trend = f.vertical_rate > 0 ? 1 : f.vertical_rate < 0 ? -1 : 0
        return {
          ...prev,
          [key]: {
            ...f,
            altitude_ft: f.altitude_ft + trend * (100 + Math.round(Math.random() * 100)),
            ground_speed_kts: f.ground_speed_kts + Math.round((Math.random() - 0.5) * 6),
            track: (f.track + Math.round((Math.random() - 0.5) * 4) + 360) % 360,
            pingedAt: Date.now(),
          },
        }
      })
      setNow(Date.now())
      setPingingKey(null)
      haptic('light')
    }, 600)
  }, [])

  const cf = settings.trafficFields.card
  const rf = settings.trafficFields.row
  const activeRowFields = ROW_FIELDS.filter(f => rf[f.key])
  const selected = selectedKey ? flightsWithGeo[selectedKey] : null

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <ResetButton onReset={handleReset} />
      </div>

      {/* ── PREVIEW banner ── */}
      <div style={{
        background: 'rgba(252,211,77,0.07)', border: '1px solid rgba(252,211,77,0.25)',
        borderLeft: '3px solid var(--cp-yellow)', borderRadius: 4, padding: '8px 14px', marginBottom: 20,
        fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--cp-yellow)',
        lineHeight: 1.6,
      }}>
        🔭 PREVIEW · SAMPLE DATA
        <span style={{ color: 'var(--cp-dim)' }}> — live tracking activates once SkyLink API access is approved. Positions below are illustrative and not filtered live by center/radius.</span>
      </div>

      {/* ── Center ── */}
      <SectionHeader title="Center" />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <div className="cp-label" style={{ marginBottom: 4 }}>ICAO</div>
          <input className="cp-input" style={{ width: 100, fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase' }}
            placeholder="e.g. WMKK" maxLength={4} value={centerIcao}
            onChange={e => { setCenterIcao(e.target.value.toUpperCase()); setCenterMode('icao') }} />
        </div>
        {quickPicks.length > 0 && (
          <div>
            <div className="cp-label" style={{ marginBottom: 4 }}>QUICK PICK</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {quickPicks.map(({ icao, label }) => (
                <button key={label} className="cp-btn" style={{ padding: '5px 8px', fontSize: 10 }}
                  onClick={() => setQuickPick(icao)}>{label} · {icao}</button>
              ))}
              <button className="cp-btn" style={{ padding: '5px 8px', fontSize: 10 }} onClick={handleGps}>📍 GPS</button>
            </div>
          </div>
        )}
        {quickPicks.length === 0 && (
          <button className="cp-btn" style={{ padding: '7px 12px' }} onClick={handleGps}>📍 USE GPS</button>
        )}
        <div>
          <div className="cp-label" style={{ marginBottom: 4 }}>RADIUS</div>
          <select value={radius} onChange={e => setRadius(Number(e.target.value))} style={{
            background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)', borderRadius: 4,
            color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)', fontSize: 12, padding: '7px 10px', cursor: 'pointer',
          }}>
            <option value={25}>25 NM</option>
            <option value={50}>50 NM</option>
            <option value={100}>100 NM</option>
          </select>
        </div>
        <button className="cp-btn" style={{ padding: '7px 12px', marginLeft: 'auto' }} onClick={() => setFieldsOpen(true)}>
          ⚙ SHOW/HIDE FIELDS
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.06em', marginBottom: 20 }}>
        Centered on {centerLabel} · {radius} NM radius
        {gpsError && <span style={{ color: 'var(--cp-orange)' }}> · {gpsError}</span>}
      </div>

      {/* ── Radar map (schematic — not to scale) ── */}
      <RadarMap flights={flightsWithGeo} selectedKey={selectedKey} centerLabel={centerLabel.split(' ')[0].slice(0, 4)} />

      {/* ── Table ── */}
      <div className="cp-label" style={{ marginBottom: 8 }}>CLICK A ROW TO VIEW FLIGHT STATUS</div>
      <table className="cp-table">
        <thead><tr><th>Callsign</th>{activeRowFields.map(f => <th key={f.key}>{f.label}</th>)}</tr></thead>
        <tbody>
          {Object.entries(flightsWithGeo).map(([key, f]) => (
            <tr key={key} className={key === selectedKey ? 'active' : ''} style={{ cursor: 'pointer' }} onClick={() => setSelectedKey(key)}>
              <td style={{ fontFamily: 'var(--cb-font-mono)', fontWeight: 700, padding: '7px 8px' }}>{f.callsign}</td>
              {activeRowFields.map(fld => <RowCell key={fld.key} field={fld.key} f={f} now={now} />)}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Flight status panel ── */}
      <div style={{ marginTop: 16 }}>
        {selected
          ? <FlightStatusPanel f={selected} cf={cf} now={now} pinging={pingingKey === selectedKey} onPing={() => pingFlight(selectedKey)} />
          : <div style={{ textAlign: 'center', color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)',
              fontSize: 11, letterSpacing: '0.1em', padding: '20px 0' }}>SELECT A FLIGHT ABOVE TO VIEW STATUS DETAILS</div>}
      </div>

      {fieldsOpen && (
        <FieldsModal cf={cf} rf={rf}
          onToggleCard={(key, val) => updateSettings({ trafficFields: { ...settings.trafficFields, card: { ...cf, [key]: val } } })}
          onToggleRow={(key, val) => updateSettings({ trafficFields: { ...settings.trafficFields, row: { ...rf, [key]: val } } })}
          onClose={() => setFieldsOpen(false)} />
      )}
    </div>
  )
}

// ── Table cell ───────────────────────────────────────────────────────────────
function RowCell({ field, f, now }) {
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
    case 'route':         return <td>{f.flightStatus?.route ?? '—'}</td>
    case 'dist_brg':      return <td>{fmtDistBrg(f.distNm, f.brgDeg)}</td>
    case 'last_contact':  return <td>{fmtPinged(f.pingedAt, now)}</td>
    case 'status':        return <td>{f.flightStatus ? `${f.flightStatus.flight} ${f.flightStatus.status}` : 'No flight plan'}</td>
    default: return <td />
  }
}

// ── Radar map ────────────────────────────────────────────────────────────────
const TICK_ANGLES = [30, 60, 120, 150, 210, 240, 300, 330]
function RadarMap({ flights, selectedKey, centerLabel }) {
  const cx = 190, cy = 190, rOuter = 170, rIn = 162
  const selected = selectedKey ? flights[selectedKey] : null
  return (
    <div style={{ background: 'var(--cp-bg3)', borderRadius: 6, padding: 14, display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
      <svg width="360" height="360" viewBox="-20 -20 420 420">
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
        {Object.entries(flights).map(([key, f]) => {
          const color = f.vertical_rate > 100 ? 'var(--cp-green)' : f.vertical_rate < -100 ? 'var(--cp-orange)' : 'var(--cp-dim)'
          const { x, y } = f.screenPos
          return (
            <g key={key}>
              <g transform={`translate(${x},${y}) rotate(${f.track})`}><path d="M0,-9 L6,7 L0,4 L-6,7 Z" fill={color} /></g>
              <text x={x + 8} y={y - 4} fill={color} fontSize="9" fontFamily="var(--cb-font-mono)">{f.callsign} {fmtAlt(f.altitude_ft)}</text>
            </g>
          )
        })}
        {selected && (
          <circle cx={selected.screenPos.x} cy={selected.screenPos.y} r="15" fill="none" stroke="var(--cp-acc)"
            strokeWidth="2" strokeDasharray="3 3" style={{ animation: 'trafficSelPulse 1.1s ease-in-out infinite' }} />
        )}
      </svg>
      <style>{'@keyframes trafficSelPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }'}</style>
    </div>
  )
}

// ── Flight status panel ─────────────────────────────────────────────────────
function FlightStatusPanel({ f, cf, now, pinging, onPing }) {
  const L = f.lookup

  const subParts = []
  if (cf.registration) subParts.push(f.registration)
  if (cf.aircraft_type) subParts.push(f.aircraft_type)
  if (cf.icao24) subParts.push(`icao24 ${f.icao24}`)

  const liveParts = []
  if (cf.altitude) liveParts.push(fmtAlt(f.altitude_ft))
  if (cf.ground_speed) liveParts.push(`${f.ground_speed_kts} kts`)
  if (cf.track) liveParts.push(`trk ${f.track}°`)
  if (cf.vertical_rate) liveParts.push(fmtVs(f.vertical_rate))
  if (cf.squawk) liveParts.push(`sqk ${f.squawk}`)
  if (cf.on_ground) liveParts.push(f.on_ground ? 'ON GROUND' : 'AIRBORNE')

  const lookupLine2 = []
  if (cf.manufacturer) lookupLine2.push(L.manufacturer)
  if (cf.operator) lookupLine2.push(L.operator + (cf.operator_icao && L.operator_icao ? ` (${L.operator_icao})` : ''))
  if (cf.operator_iata && L.operator_iata) lookupLine2.push(L.operator_iata)
  if (cf.country) lookupLine2.push(L.country)
  const lookupLine3 = []
  if (cf.engines) lookupLine3.push(`${L.engines}× ${L.engine_type}`)
  if (cf.year_manufactured) lookupLine3.push(`built ${L.year_manufactured}`)
  if (cf.serial_number) lookupLine3.push(`s/n ${L.serial_number}`)
  if (cf.military && L.military) lookupLine3.push('MILITARY')
  const anyLookup = cf.type_name || lookupLine2.length || lookupLine3.length

  const statusGrid = []
  if (f.flightStatus) {
    if (cf.flight_number) statusGrid.push(['Flight', f.flightStatus.flight])
    statusGrid.push(['Route', f.flightStatus.route])
    if (cf.airline) statusGrid.push(['Airline', f.flightStatus.airline])
    if (cf.scheduled) { statusGrid.push(['Sched Dep', f.flightStatus.schedDep]); statusGrid.push(['Sched Arr', f.flightStatus.schedArr]) }
    if (cf.estimated) statusGrid.push(['Est Arr', f.flightStatus.estArr])
    if (cf.status) statusGrid.push(['Status', <span style={{ color: f.flightStatus.statusColor }}>{f.flightStatus.status}</span>])
    if (cf.delay) statusGrid.push(['Delay', <span style={{ color: f.flightStatus.delayColor }}>{f.flightStatus.delay}</span>])
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

      {(f.flightStatus && statusGrid.length > 0) || !f.flightStatus ? (
        <>
          <div style={{ borderTop: '1px solid var(--cp-border3)', margin: '12px 0' }} />
          {f.flightStatus
            ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 16px' }}>
                {statusGrid.map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 3 }}>{k}</div>
                    <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, color: 'var(--cp-txt)' }}>{v}</div>
                  </div>
                ))}
              </div>
            : <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', lineHeight: 1.6 }}>{f.note}</div>}
        </>
      ) : null}

      {anyLookup && (
        <>
          <div style={{ borderTop: '1px solid var(--cp-border3)', margin: '12px 0' }} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 6, background: 'var(--cp-bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--cp-dim)' }}>✈</div>
            <div>
              {cf.type_name && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--cp-txt)' }}>{L.type_name}</div>}
              {lookupLine2.length > 0 && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginTop: 2 }}>{lookupLine2.join(' · ')}</div>}
              {lookupLine3.length > 0 && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginTop: 2 }}>{lookupLine3.join(' · ')}</div>}
            </div>
          </div>
        </>
      )}

      <div style={{ marginTop: 14, fontSize: 9, fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.1em', color: 'var(--cp-dim)', textTransform: 'uppercase' }}>
        🔭 Sample data — not a live SkyLink response
      </div>
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
