import React, { useState, useEffect, useMemo } from 'react'
import { lookupAirport, searchAirports } from '../data/airports'
import { normalizeSchedule } from '../utils/schedules'
import { normalizeFlightStatus } from '../utils/traffic'
import ResetButton from './ResetButton'

function SectionHeader({ title }) {
  return (
    <div className="cp-section-header">
      <span className="cp-section-title">{title}</span>
      <div className="cp-divider" />
    </div>
  )
}

const PAGE_SIZE = 10

// SkyLink's schedule endpoints (confirmed live, RapidAPI console, 11 Jul 2026):
// date is DD-MM-YYYY, range 5 days back to 1 day forward from today.
const toISO = d => d.toISOString().slice(0, 10)
const TODAY = new Date()
const DATE_MIN = toISO(new Date(TODAY.getTime() - 5 * 86400000))
const DATE_MAX = toISO(new Date(TODAY.getTime() + 1 * 86400000))
function isoToApiDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

async function fetchSchedule(icao, direction, dateIso, timeFrom, signal) {
  const params = new URLSearchParams({ resource: direction, icao })
  if (dateIso) params.set('date', isoToApiDate(dateIso))
  if (timeFrom) params.set('time', timeFrom)
  const res = await fetch(`/api/skylink?${params}`, { signal })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
  return normalizeSchedule(body, direction)
}
async function fetchFlightStatus(flight, signal) {
  const params = new URLSearchParams({ resource: 'flight-status', flight })
  const res = await fetch(`/api/skylink?${params}`, { signal })
  if (!res.ok) return null
  return res.json().catch(() => null)
}

export default function FlightSchedulesViewer() {
  const [icao, setIcao] = useState('')
  const [direction, setDirection] = useState('arrivals')
  const [flights, setFlights] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)
  const [dateIso, setDateIso] = useState(() => toISO(new Date()))
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedKey, setSelectedKey] = useState(null)
  const [detailsCache, setDetailsCache] = useState({}) // key -> { loading, status }

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

  const airport = icao.trim().length >= 3 ? lookupAirport(icao) : null
  const pickerResults = icao.trim().length >= 2 ? searchAirports(icao) : []

  const handleReset = () => {
    setIcao(''); setDirection('arrivals'); setFlights(null); setError(''); setSearchQuery('')
    setPickerOpen(false); setDateIso(toISO(new Date())); setTimeFrom(''); setTimeTo('')
    setCurrentPage(1); setSelectedKey(null); setDetailsCache({})
  }

  const handleFetch = async (dir = direction) => {
    const code = icao.trim().toUpperCase()
    if (code.length < 3) { setError('Enter an airport ICAO code.'); return }
    if (!navigator.onLine) { setError('Offline — connect to fetch the schedule.'); return }
    setError(''); setLoading(true); setFlights(null); setSelectedKey(null); setDetailsCache({})
    try {
      const result = await fetchSchedule(code, dir, dateIso, timeFrom, AbortSignal.timeout(20_000))
      setFlights(result)
    } catch (e) {
      setError(`Failed to fetch schedule: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const switchDirection = (dir) => {
    setDirection(dir)
    if (flights) handleFetch(dir)
  }

  const filtered = useMemo(() => {
    if (!flights) return []
    const terms = searchQuery.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
    let list = terms.length
      ? flights.filter(f =>
          (f.flight && f.flight.toUpperCase().includes(terms[0])) ||
          (f.airline && f.airline.toUpperCase().includes(terms[0])) ||
          (f.place && f.place.toUpperCase().includes(terms[0])) ||
          (f.placeIata && f.placeIata.toUpperCase().includes(terms[0])))
      : flights
    // The API's `time` param is a start anchor, not a strict bound — enforce
    // both ends of the range client-side against the flight's actual HH:MM.
    if (timeFrom) list = list.filter(f => !f.timeHHMM || f.timeHHMM >= timeFrom)
    if (timeTo) list = list.filter(f => !f.timeHHMM || f.timeHHMM <= timeTo)
    return [...list].sort((a, b) => (a.timeHHMM || '').localeCompare(b.timeHHMM || ''))
  }, [flights, searchQuery, timeFrom, timeTo])

  useEffect(() => { setCurrentPage(1) }, [flights, searchQuery, timeFrom, timeTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(currentPage, totalPages)
  const pageFlights = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const selectRow = (key, flightNumber) => {
    setSelectedKey(k => k === key ? null : key)
    if (selectedKey === key || detailsCache[key] || !flightNumber || flightNumber === '—') return
    const controller = new AbortController()
    setDetailsCache(prev => ({ ...prev, [key]: { loading: true } }))
    fetchFlightStatus(flightNumber, controller.signal)
      .then(raw => setDetailsCache(prev => ({ ...prev, [key]: { loading: false, status: normalizeFlightStatus(raw) } })))
      .catch(() => setDetailsCache(prev => ({ ...prev, [key]: { loading: false, status: null } })))
  }

  const selectedDetails = selectedKey ? detailsCache[selectedKey] : null
  const selectedFlight = selectedKey ? pageFlights.find((f, i) => `${f.flight}|${f.time}|${i}` === selectedKey) : null

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <ResetButton onReset={handleReset} />
      </div>

      {isOffline && (
        <div style={{
          background: 'rgba(252,211,77,0.07)', border: '1px solid rgba(252,211,77,0.25)',
          borderLeft: '3px solid var(--cp-yellow)', borderRadius: 4, padding: '8px 14px', marginBottom: 20,
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--cp-yellow)',
        }}>
          ⚠ REQUIRES INTERNET CONNECTION — schedules are live-only, resumes automatically once you're back online
        </div>
      )}

      <div style={isOffline ? { opacity: 0.35, filter: 'grayscale(1)', pointerEvents: 'none' } : undefined}>

      {/* ── Airport ── */}
      <SectionHeader title="Airport" />
      <div style={{ marginBottom: 8 }}>
        <input className="cp-input" style={{ width: '100%', fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          placeholder="e.g. WMKK" value={icao} maxLength={4}
          onChange={e => { setIcao(e.target.value.toUpperCase()); setPickerOpen(true) }}
          onFocus={() => setPickerOpen(true)}
          onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
          onKeyDown={e => e.key === 'Enter' && handleFetch()} />
        {pickerOpen && pickerResults.length > 0 && (
          <div style={{ marginTop: 4,
            background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)', borderRadius: 6, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
            {pickerResults.slice(0, 8).map(r => (
              <button key={r.icao} onClick={() => { setIcao(r.icao); setPickerOpen(false) }} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                background: 'transparent', border: 'none', borderBottom: '1px solid var(--cp-border)',
                padding: '8px 12px', cursor: 'pointer', textAlign: 'left' }}>
                <div>
                  <div style={{ fontFamily: 'var(--cb-font-body)', fontSize: 13, color: 'var(--cp-txt)' }}>{r.icao} — {r.name}</div>
                  <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)' }}>{r.city}, {r.country}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        {airport && (
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)', marginTop: 6 }}>
            {airport.name} — {airport.city}, {airport.country}
          </div>
        )}
      </div>

      {/* ── Date & time range ── */}
      <SectionHeader title="Date & Time Range" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <input type="date" value={dateIso} min={DATE_MIN} max={DATE_MAX} onChange={e => setDateIso(e.target.value)} style={{
          flex: '1 1 140px', background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)', borderRadius: 6,
          color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)', fontSize: 12, padding: '7px 8px',
        }} />
        <input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} placeholder="From" style={{
          flex: '1 1 100px', background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)', borderRadius: 6,
          color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)', fontSize: 12, padding: '7px 8px',
        }} />
        <input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} placeholder="To" style={{
          flex: '1 1 100px', background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)', borderRadius: 6,
          color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)', fontSize: 12, padding: '7px 8px',
        }} />
      </div>
      <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.06em', marginBottom: 12 }}>
        Date range: {DATE_MIN} to {DATE_MAX}. Time range filters within that day's board.
      </div>

      {/* ── Direction ── */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)', borderRadius: 6, padding: 3, gap: 3 }}>
          {[['arrivals', 'ARRIVALS'], ['departures', 'DEPARTURES']].map(([id, label]) => (
            <button key={id} onClick={() => switchDirection(id)} style={{
              fontFamily: 'var(--cb-font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
              padding: '6px 16px', borderRadius: 4,
              border: `1px solid ${direction === id ? 'var(--cp-acc)' : 'transparent'}`,
              background: direction === id ? 'var(--cp-accdim)' : 'transparent',
              color: direction === id ? 'var(--cp-acc)' : 'var(--cp-dim)', cursor: 'pointer', transition: 'all 0.12s',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ fontFamily: 'var(--cb-font-body)', fontSize: 12, color: 'var(--cp-orange)', background: 'rgba(251,146,60,0.08)',
          border: '1px solid rgba(251,146,60,0.25)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>⚠ {error}</div>
      )}

      <button onClick={() => handleFetch()} disabled={loading || icao.trim().length < 3} style={{
        width: '100%', marginBottom: 20, padding: '12px', background: 'rgba(var(--cp-acc-rgb,63,224,197),0.12)',
        border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.35)', borderRadius: 6,
        cursor: icao.trim().length >= 3 ? 'pointer' : 'default', fontFamily: 'var(--cb-font-mono)', fontSize: 10,
        letterSpacing: '0.16em', color: 'var(--cp-acc)', opacity: icao.trim().length >= 3 ? 1 : 0.5 }}>
        {loading ? '⊙ FETCHING SCHEDULE…' : '⊕ FETCH SCHEDULE'}
      </button>

      {/* ── Results ── */}
      {flights && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input className="cp-input" style={{ flex: 1, fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
              placeholder={`🔍 Search flight #, airline, or ${direction === 'arrivals' ? 'origin' : 'destination'}`}
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {searchQuery && (
              <button className="cp-btn" style={{ padding: '7px 10px', flexShrink: 0 }} onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>

          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.08em', marginBottom: 8 }}>
            {filtered.length} OF {flights.length} {direction.toUpperCase()}
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)',
              fontSize: 11, letterSpacing: '0.1em', padding: '20px 0' }}>
              {searchQuery || timeFrom || timeTo ? 'NO MATCHING FLIGHTS' : 'NO FLIGHTS FOUND'}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="cp-table" style={{ minWidth: 480 }}>
                  <thead>
                    <tr>
                      <th>Time</th><th>Flight</th><th>Airline</th>
                      <th>{direction === 'arrivals' ? 'From' : 'To'}</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageFlights.map((f, i) => {
                      const key = `${f.flight}|${f.time}|${i}`
                      return (
                        <tr key={key} className={key === selectedKey ? 'active' : ''} style={{ cursor: 'pointer' }}
                          onClick={() => selectRow(key, f.flight)}>
                          <td style={{ fontFamily: 'var(--cb-font-mono)' }}>{f.time || '—'}</td>
                          <td style={{ fontFamily: 'var(--cb-font-mono)', fontWeight: 700 }}>{f.flight}</td>
                          <td>{f.airline || '—'}</td>
                          <td>{f.place ? `${f.place}${f.placeIata ? ` (${f.placeIata})` : ''}` : '—'}</td>
                          <td style={{ color: f.statusColor || 'var(--cp-txt)' }}>{f.status || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
                  <button className="cp-btn" disabled={page === 1} onClick={() => setCurrentPage(page - 1)}
                    style={{ padding: '5px 10px', opacity: page === 1 ? 0.4 : 1 }}>‹</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                    <button key={n} onClick={() => setCurrentPage(n)} style={{
                      minWidth: 28, padding: '5px 8px', borderRadius: 4,
                      border: `1px solid ${n === page ? 'var(--cp-acc)' : 'var(--cp-border)'}`,
                      background: n === page ? 'var(--cp-accdim)' : 'transparent',
                      color: n === page ? 'var(--cp-acc)' : 'var(--cp-dim)',
                      fontFamily: 'var(--cb-font-mono)', fontSize: 11, cursor: 'pointer',
                    }}>{n}</button>
                  ))}
                  <button className="cp-btn" disabled={page === totalPages} onClick={() => setCurrentPage(page + 1)}
                    style={{ padding: '5px 10px', opacity: page === totalPages ? 0.4 : 1 }}>›</button>
                </div>
              )}

              {selectedFlight && (
                <div className="cp-card-accent" style={{ marginTop: 16 }}>
                  <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--cp-acc)', marginBottom: 8 }}>
                    {selectedFlight.flight} — Terminal / Gate
                  </div>
                  {selectedDetails?.loading ? (
                    <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)' }}>Loading…</div>
                  ) : (() => {
                    const s = selectedDetails?.status
                    const items = s ? [
                      ...(s.depTerminal ? [['Dep Terminal', s.depTerminal]] : []),
                      ...(s.depGate ? [['Dep Gate', s.depGate]] : []),
                      ...(s.arrTerminal ? [['Arr Terminal', s.arrTerminal]] : []),
                      ...(s.arrGate ? [['Arr Gate', s.arrGate]] : []),
                    ] : []
                    return items.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '10px 16px' }}>
                        {items.map(([k, v]) => (
                          <div key={k}>
                            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 3 }}>{k}</div>
                            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, color: 'var(--cp-txt)' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', lineHeight: 1.6 }}>
                        No matching SkyLink flight_status record for this flight (private/VFR traffic, or not currently scheduled).
                      </div>
                    )
                  })()}
                </div>
              )}
            </>
          )}
        </>
      )}

      </div>
    </div>
  )
}
