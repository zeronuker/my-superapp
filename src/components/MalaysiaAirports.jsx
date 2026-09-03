import React, { useState } from 'react'
import RadarSweepLoader, { computeAnimDuration } from './RadarSweepLoader'
import { ROLE_TINT } from '../utils/roleStyle'

const AIRPORTS = [
  { label: 'KUL — KLIA Terminal 1', value: 'KLIA' },
  { label: 'KUL — KLIA Terminal 2', value: 'KLIA2' },
  { label: 'BKI — Kota Kinabalu',   value: 'BKI' },
  { label: 'KCH — Kuching',         value: 'KCH' },
  { label: 'LGK — Langkawi',        value: 'LGK' },
  { label: 'PEN — Penang',          value: 'PEN' },
]

const DAYS = [
  { label: 'Yesterday', value: -1 },
  { label: 'Today',     value: 0 },
  { label: 'Tomorrow',  value: 1 },
]

const CRITERIA = [
  { label: 'Flight Number', value: 'flight' },
  { label: 'City',          value: 'city' },
  { label: 'Airline',       value: 'airline' },
]

const sel = {
  background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)',
  borderRadius: 4, color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)',
  fontSize: 12, padding: '7px 10px', outline: 'none', cursor: 'pointer', width: '100%',
}
const label = {
  fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)', marginBottom: 4,
}

// Overall flight status → accent colour (best-effort keyword match; the API
// returns free-text status strings, not a fixed enum).
function statusColor(status) {
  const s = (status || '').toUpperCase()
  if (/CANCEL|DELAY/.test(s)) return 'var(--cp-red)'
  if (/DIVERT/.test(s)) return 'var(--cp-purple)'
  if (/BOARD|GATE OPEN|CHECK/.test(s)) return 'var(--cp-yellow)'
  if (/DEPART|ARRIV|LAND/.test(s)) return 'var(--cp-green)'
  if (/SCHED|EXPECT|ON TIME/.test(s)) return 'var(--cp-acc2)'
  return 'var(--cp-dim)'
}

const CATEGORY = {
  I: { label: 'INTL', color: 'var(--cp-acc2)' },
  D: { label: 'DOM',  color: 'var(--cp-green)' },
}

const hm = (t) => (t ? t.slice(11, 16) : '—')

function FlightCard({ f }) {
  const color = statusColor(f.status)
  const place = f.leg === 'A' ? f.origin : f.destination
  const category = CATEGORY[f.category]
  return (
    <div style={{
      background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)',
      borderLeft: `3px solid ${color}`, borderRadius: 6, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--cp-txt)', letterSpacing: '0.03em' }}>
          {f.flightNumber}
        </span>
        <span style={{
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          color, background: `color-mix(in srgb, ${color} 16%, transparent)`,
          border: `1px solid ${color}`, borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap',
        }}>
          {f.status || 'UNKNOWN'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--cp-muted)' }}>{f.name} →</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: ROLE_TINT.dep.color }}>{place?.city}</span>
        {category && (
          <span style={{
            fontFamily: 'var(--cb-font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
            color: category.color, background: `color-mix(in srgb, ${category.color} 16%, transparent)`,
            border: `1px solid ${category.color}`, borderRadius: 3, padding: '2px 6px',
          }}>
            {category.label}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
        <div style={{
          background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid ${color}`, borderRadius: 6,
          padding: '6px 16px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', minWidth: 84,
        }}>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.1em', color, opacity: 0.9 }}>
            GATE · {f.gate?.status || 'TBA'}
          </div>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 24, fontWeight: 700, color, lineHeight: 1.15 }}>
            {f.gate?.name || '—'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, fontFamily: 'var(--cb-font-mono)', fontSize: 11 }}>
          <div><span style={{ color: 'var(--cp-dim)' }}>SCHED </span><span style={{ color: 'var(--cp-txt)', fontWeight: 700 }}>{hm(f.scheduledTime)}</span></div>
          <div><span style={{ color: 'var(--cp-dim)' }}>CHECK-IN </span><span style={{ color: 'var(--cp-txt)' }}>{f.checkIn?.counters || '—'}</span></div>
        </div>
      </div>
    </div>
  )
}

export default function MalaysiaAirports() {
  const [direction, setDirection] = useState('D')
  const [terminal, setTerminal]   = useState('KLIA')
  const [dayKey, setDayKey]       = useState(0)
  const [criteria, setCriteria]   = useState('flight')
  const [query, setQuery]         = useState('')

  const [results, setResults]         = useState(null)
  const [loading, setLoading]         = useState(false)
  const [manualFetch, setManualFetch] = useState(false)
  const [scanTarget, setScanTarget]   = useState('')
  const [error, setError]             = useState(null)

  const search = async () => {
    if (criteria !== 'all' && !query.trim()) {
      setError('Enter a search value first')
      return
    }
    setLoading(true)
    setManualFetch(true)
    setScanTarget(query.trim() || AIRPORTS.find(a => a.value === terminal)?.value || terminal)
    setError(null)
    const startedAt = Date.now()

    let out = null
    let err = null
    try {
      const params = new URLSearchParams({
        code: direction, terminal, dayKey: String(dayKey), key: criteria, value: query.trim(),
      })
      const r = await fetch(`/api/gatefinder?${params}`, { signal: AbortSignal.timeout(15_000) })
      const data = await r.json().catch(() => null)
      if (!r.ok || !data) throw new Error(data?.error || 'Search failed')
      out = data.flightStatuses || []
    } catch (e) {
      err = e.name === 'TimeoutError' ? 'Request timed out' : (e.message || 'Search failed')
    }

    const reveal = () => {
      if (err) { setError(err); setResults(null) } else { setResults(out) }
      setLoading(false)
      setManualFetch(false)
    }

    // Animation always finishes before results are revealed — unless the
    // search errored, in which case surface it immediately.
    if (!err) {
      const remaining = computeAnimDuration(1) - (Date.now() - startedAt)
      if (remaining > 0) { setTimeout(reveal, remaining); return }
    }
    reveal()
  }

  return (
    <div>
      <div className="cp-section-header">
        <span className="cp-section-title">Malaysia Airports</span>
        <div className="cp-divider" />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          className={`cp-btn${direction === 'D' ? ' active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => setDirection('D')}
        >Departure</button>
        <button
          className={`cp-btn${direction === 'A' ? ' active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => setDirection('A')}
        >Arrival</button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={label}>Airport</div>
        <select style={sel} value={terminal} onChange={e => setTerminal(e.target.value)}>
          {AIRPORTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={label}>Date</div>
          <select style={sel} value={dayKey} onChange={e => setDayKey(Number(e.target.value))}>
            {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <div style={label}>Search by</div>
          <select style={sel} value={criteria} onChange={e => setCriteria(e.target.value)}>
            {CRITERIA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          className="cp-input"
          placeholder="Flight no / city / airline"
          value={query}
          onChange={e => { setQuery(e.target.value); if (error) setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') search() }}
        />
        <button className="cp-btn" onClick={search} disabled={loading} style={{ whiteSpace: 'nowrap' }}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && (
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 12, color: 'var(--cp-red)', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {manualFetch && <RadarSweepLoader targets={[scanTarget]} />}

      {results && !manualFetch && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.length === 0 ? (
            <div style={{ fontFamily: 'var(--cb-font-body)', fontSize: 12, color: 'var(--cp-dim)' }}>
              No flights found.
            </div>
          ) : (
            results.map(f => <FlightCard key={f.afsKey} f={f} />)
          )}
        </div>
      )}
    </div>
  )
}
