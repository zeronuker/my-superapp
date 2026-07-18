import React, { useState, useEffect, useRef } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { fmtDelay, normalizeFlightStatus, normalizeSkylinkPosition } from '../utils/traffic'
import ResetButton from './ResetButton'

// date is the device's own local calendar date, not UTC — a flight number
// is a distinct flight per departure day, so this has to match what "today"
// means to whoever's searching, wherever they are.
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function fetchFlightStatus(flightOrCallsign, signal) {
  const params = new URLSearchParams({ flight: flightOrCallsign, date: localDateStr() })
  const res = await fetch(`/api/aerodatabox?${params}`, { signal })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
  return body
}

// Cross-check only — SkyLink is a different ADS-B vendor than AeroDataBox,
// so it's worth a try when AeroDataBox has no live position. A failure here
// shouldn't break the main lookup, so this swallows errors and returns null.
async function fetchSkylinkPosition(callsign, signal) {
  try {
    const params = new URLSearchParams({ resource: 'adsb', callsign })
    const res = await fetch(`/api/skylink?${params}`, { signal })
    if (!res.ok) return null
    return await res.json()
  } catch (_) {
    return null
  }
}

// Field toggles for the status card. `lean` marks the on-by-default set —
// departure/arrival airport (via Route), sched dep/arr, actual dep, actual/
// est arr, dep+arr terminal/gate, and arrival delay are the default output
// this tab promises. Everything else stays off until the user opts in via
// View settings. terminal/gate each control both the departure and arrival
// sections.
const FIELDS = [
  { id: 'route', label: 'Route (dep + arr airport)', lean: true },
  { id: 'schedDep', label: 'Sched dep', lean: true },
  { id: 'schedArr', label: 'Sched arr', lean: true },
  { id: 'depActual', label: 'Actual dep', lean: true },
  { id: 'estArr', label: 'Actual/est arr', lean: true },
  { id: 'terminal', label: 'Terminal (dep & arr)', lean: true },
  { id: 'gate', label: 'Gate (dep & arr)', lean: true },
  { id: 'delay', label: 'Arrival delay', lean: true },
  { id: 'callSign', label: 'ATC callsign', lean: false },
  { id: 'baggageBelt', label: 'Baggage belt', lean: false },
  { id: 'checkInDesk', label: 'Check-in desk', lean: false },
  { id: 'predictedTime', label: 'Predicted arr', lean: false },
  { id: 'quality', label: 'Data quality', lean: false },
  { id: 'aircraft', label: 'Aircraft', lean: false },
  { id: 'photo', label: 'Aircraft photo', lean: false },
  { id: 'codeshare', label: 'Codeshare/cargo', lean: false },
  { id: 'distance', label: 'Distance', lean: false },
  { id: 'position', label: 'Live position', lean: false },
]

export default function TrafficViewer() {
  const { settings, updateSettings } = useCalculatorStore(s => ({
    settings: s.settings, updateSettings: s.updateSettings,
  }))
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const controllerRef = useRef(null)

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

  // Aborts any in-flight lookup on unmount.
  useEffect(() => () => controllerRef.current?.abort(), [])

  const cf = settings.trafficFields

  const handleReset = () => {
    controllerRef.current?.abort()
    setQuery(''); setStatus(null); setError(''); setSearched(false); setLoading(false)
  }

  // Explicit search only — AeroDataBox's Basic plan is rate-limited to ~1
  // req/sec, so this can't fire on every keystroke like a typeahead.
  const handleSearch = () => {
    const term = query.trim()
    if (!term || isOffline) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true); setError(''); setSearched(true); setStatus(null)
    fetchFlightStatus(term, controller.signal)
      .then(async raw => {
        const normalized = normalizeFlightStatus(raw)
        // AeroDataBox had nothing for live position — try SkyLink's separate
        // ADS-B feed as a cross-check, only when the user actually wants to
        // see it and there's a callsign to search with.
        const callsign = normalized?.callSign || term
        if (normalized && cf.position && !normalized.position && callsign) {
          const skylinkRaw = await fetchSkylinkPosition(callsign, controller.signal)
          normalized.position = normalizeSkylinkPosition(skylinkRaw)
        }
        setStatus(normalized)
      })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message || 'Failed to fetch flight status') })
      .finally(() => setLoading(false))
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <button title="View settings" onClick={() => setSettingsOpen(true)} style={{
          width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: '1px solid var(--cp-border)', borderRadius: 6,
          color: 'var(--cp-dim)', cursor: 'pointer', fontSize: 15,
        }}>⚙</button>
        <ResetButton onReset={handleReset} />
      </div>

      {isOffline && (
        <div style={{
          background: 'rgba(252,211,77,0.07)', border: '1px solid rgba(252,211,77,0.25)',
          borderLeft: '3px solid var(--cp-yellow)', borderRadius: 4, padding: '8px 14px', marginBottom: 20,
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--cp-yellow)',
        }}>
          ⚠ REQUIRES INTERNET CONNECTION — flight status is live-only, resumes automatically once you're back online
        </div>
      )}

      <div style={isOffline ? { opacity: 0.35, filter: 'grayscale(1)', pointerEvents: 'none' } : undefined}>

        <div style={{ display: 'flex', gap: 8 }}>
          <input className="cp-input" autoFocus style={{ flex: 1, fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
            placeholder="Callsign or flight number, e.g. MAS123"
            value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          {query && (
            <button className="cp-btn" style={{ padding: '7px 10px', flexShrink: 0 }} onClick={() => { setQuery(''); setStatus(null); setError(''); setSearched(false) }}>✕</button>
          )}
          <button className="cp-btn" style={{ padding: '7px 14px', flexShrink: 0 }} disabled={loading || !query.trim()} onClick={handleSearch}>
            {loading ? '…' : '🔍 Search'}
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.25)',
            borderLeft: '3px solid var(--cp-red)', borderRadius: 4, padding: '8px 14px', marginTop: 12,
            fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--cp-red)',
          }}>⚠ {error}</div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)',
            fontSize: 11, letterSpacing: '0.1em', padding: '24px 0' }}>
            LOOKING UP…
          </div>
        )}

        {!loading && !error && searched && !status && (
          <div style={{ textAlign: 'center', color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)',
            fontSize: 11, letterSpacing: '0.1em', lineHeight: 1.6, padding: '24px 0' }}>
            NO MATCHING FLIGHT<br />private/VFR traffic, or not currently scheduled
          </div>
        )}

        {!loading && !searched && (
          <div style={{ textAlign: 'center', color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)',
            fontSize: 11, letterSpacing: '0.1em', padding: '24px 0' }}>
            ENTER A CALLSIGN OR FLIGHT NUMBER, THEN SEARCH
          </div>
        )}

        {!loading && status && <StatusCard s={status} cf={cf} />}

      </div>

      {settingsOpen && (
        <SettingsModal cf={cf}
          onToggle={(id, val) => updateSettings({ trafficFields: { ...cf, [id]: val } })}
          onSetFields={fields => updateSettings({ trafficFields: fields })}
          onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  )
}

// ── Status card — grouped into Live position / Departure / Arrival sections,
// each shown only when a field belonging to it is toggled on. Within a
// visible section, every toggled field renders — with "—" if the API had
// no data for it — so the grid shape stays predictable. ──
function SectionLabel({ children }) {
  return <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 8 }}>{children}</div>
}
function Section({ title, children }) {
  return (
    <>
      <div style={{ borderTop: '1px solid var(--cp-border3)', margin: '12px 0' }} />
      <SectionLabel>{title}</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '10px 16px' }}>
        {children}
      </div>
    </>
  )
}
function Cell({ label, value }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, color: 'var(--cp-txt)' }}>{value ?? '—'}</div>
    </div>
  )
}

function StatusCard({ s, cf }) {
  const showLive = cf.position
  const showDep = cf.terminal || cf.gate || cf.checkInDesk || cf.schedDep || cf.depActual
  const showArr = cf.terminal || cf.gate || cf.baggageBelt || cf.schedArr || cf.estArr || cf.predictedTime || cf.quality || cf.delay

  return (
    <div className="cp-card-accent" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--cp-acc)', letterSpacing: '0.06em' }}>{s.flight}</span>
            {cf.codeshare && s.codeshare && (
              <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 4, background: 'var(--cp-accdim)', color: 'var(--cp-acc)' }}>{s.codeshare}</span>
            )}
          </div>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginTop: 2 }}>
            {[s.airline, cf.callSign && s.callSign ? `callsign ${s.callSign}` : null].filter(Boolean).join(' · ')}
          </div>
          {cf.aircraft && s.aircraft && (
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)', marginTop: 2 }}>{s.aircraft}</div>
          )}
        </div>
        {cf.photo && s.photo && (
          <img src={s.photo} alt="" style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
            onError={e => { e.currentTarget.style.display = 'none' }} />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          color: s.statusColor, background: 'var(--cp-bg3)', padding: '3px 10px', borderRadius: 4,
        }}>{s.status}</span>
        {cf.route && s.route && <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-txt)' }}>{s.route}</span>}
        {cf.distance && s.distance && <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)' }}>{s.distance} great-circle</span>}
      </div>

      {showLive && (
        <Section title="Live position">
          <Cell label="Lat/lon" value={s.position?.latLon} />
          <Cell label="Alt" value={s.position?.alt} />
          <Cell label="Speed" value={s.position?.speed} />
          <Cell label="Heading" value={s.position?.heading} />
        </Section>
      )}

      {showDep && (
        <Section title={`Departure${s.depCode ? ` · ${s.depCode}` : ''}`}>
          {cf.terminal && <Cell label="Terminal" value={s.depTerminal} />}
          {cf.gate && <Cell label="Gate" value={s.depGate} />}
          {cf.checkInDesk && <Cell label="Check-in" value={s.depCheckInDesk} />}
          {cf.schedDep && <Cell label="Sched" value={s.schedDep} />}
          {cf.depActual && <Cell label="Actual" value={s.depActual} />}
        </Section>
      )}

      {showArr && (
        <Section title={`Arrival${s.arrCode ? ` · ${s.arrCode}` : ''}`}>
          {cf.delay && <Cell label="Delay" value={fmtDelay(s.delayMinutes) ? <span style={{ color: s.delayMinutes > 0 ? 'var(--cp-orange)' : 'var(--cp-txt)' }}>{fmtDelay(s.delayMinutes)}</span> : null} />}
          {cf.terminal && <Cell label="Terminal" value={s.arrTerminal} />}
          {cf.gate && <Cell label="Gate" value={s.arrGate} />}
          {cf.baggageBelt && <Cell label="Baggage belt" value={s.arrBaggageBelt} />}
          {cf.schedArr && <Cell label="Sched" value={s.schedArr} />}
          {cf.estArr && <Cell label="Actual/est" value={s.estArr} />}
          {cf.predictedTime && <Cell label="Predicted" value={s.arrPredictedTime} />}
          {cf.quality && <Cell label="Quality" value={s.quality} />}
        </Section>
      )}
    </div>
  )
}

// ── View settings modal — flat field list + a View all toggle. Toggling
// "View all" checks every field; clicking again restores the lean default. ──
function SettingsModal({ cf, onToggle, onSetFields, onClose }) {
  const allOn = FIELDS.every(f => cf[f.id])
  const handleViewAll = () => onSetFields(Object.fromEntries(FIELDS.map(f => [f.id, allOn ? f.lean : true])))
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
          <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cp-acc)' }}>View settings</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--cp-dim)', fontSize: 16, cursor: 'pointer', padding: '2px 6px' }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px 20px' }}>
          <button className="cp-btn" style={{ width: '100%', marginBottom: 12 }} onClick={handleViewAll}>
            {allOn ? 'Reset to lean view' : 'View all'}
          </button>
          {FIELDS.map(f => (
            <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!cf[f.id]} onChange={e => onToggle(f.id, e.target.checked)} style={{ accentColor: 'var(--cp-acc)', cursor: 'pointer' }} />
              {f.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
