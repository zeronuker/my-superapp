import React, { useState, useEffect, useMemo } from 'react'
import { lookupAirport, searchAirports } from '../data/airports'
import { normalizeSchedule } from '../utils/schedules'
import ResetButton from './ResetButton'

function SectionHeader({ title }) {
  return (
    <div className="cp-section-header">
      <span className="cp-section-title">{title}</span>
      <div className="cp-divider" />
    </div>
  )
}

async function fetchSchedule(icao, direction, signal) {
  const params = new URLSearchParams({ resource: direction, icao })
  const res = await fetch(`/api/skylink?${params}`, { signal })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
  return normalizeSchedule(body, direction)
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
    setPickerOpen(false)
  }

  const handleFetch = async (dir = direction) => {
    const code = icao.trim().toUpperCase()
    if (code.length < 3) { setError('Enter an airport ICAO code.'); return }
    if (!navigator.onLine) { setError('Offline — connect to fetch the schedule.'); return }
    setError(''); setLoading(true); setFlights(null)
    try {
      const result = await fetchSchedule(code, dir, AbortSignal.timeout(20_000))
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
    const list = terms.length
      ? flights.filter(f =>
          (f.flight && f.flight.toUpperCase().includes(terms[0])) ||
          (f.airline && f.airline.toUpperCase().includes(terms[0])) ||
          (f.place && f.place.toUpperCase().includes(terms[0])) ||
          (f.placeIata && f.placeIata.toUpperCase().includes(terms[0])))
      : flights
    return [...list].sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  }, [flights, searchQuery])

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
              {searchQuery ? 'NO MATCHING FLIGHTS' : 'NO FLIGHTS FOUND'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="cp-table" style={{ minWidth: 480 }}>
                <thead>
                  <tr>
                    <th>Time</th><th>Flight</th><th>Airline</th>
                    <th>{direction === 'arrivals' ? 'From' : 'To'}</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--cb-font-mono)' }}>{f.time || '—'}</td>
                      <td style={{ fontFamily: 'var(--cb-font-mono)', fontWeight: 700 }}>{f.flight}</td>
                      <td>{f.airline || '—'}</td>
                      <td>{f.place ? `${f.place}${f.placeIata ? ` (${f.placeIata})` : ''}` : '—'}</td>
                      <td style={{ color: f.statusColor || 'var(--cp-txt)' }}>{f.status || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      </div>
    </div>
  )
}
