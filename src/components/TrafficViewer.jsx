import React, { useState, useEffect, useRef } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { fmtDelay, normalizeFlightStatus } from '../utils/traffic'
import ResetButton from './ResetButton'

async function fetchFlightStatus(flightOrCallsign, signal) {
  const date = new Date().toISOString().slice(0, 10)
  const params = new URLSearchParams({ flight: flightOrCallsign, date })
  const res = await fetch(`/api/aerodatabox?${params}`, { signal })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
  return body
}

// Field toggles for the status card. `lean` marks the on-by-default set;
// everything else stays off until the user opts in via View settings.
const FIELDS = [
  { id: 'route', label: 'Route', lean: true, get: s => s.route },
  { id: 'schedArr', label: 'Sched arr', lean: true, get: s => s.schedArr },
  { id: 'estArr', label: 'Actual/est arr', lean: true, get: s => s.estArr },
  { id: 'delay', label: 'Delay', lean: true, get: s => {
    const label = fmtDelay(s.delayMinutes)
    return label ? <span style={{ color: s.delayMinutes > 0 ? 'var(--cp-orange)' : 'var(--cp-txt)' }}>{label}</span> : null
  } },
  { id: 'terminal', label: 'Terminal', lean: true, get: s => s.arrTerminal },
  { id: 'gate', label: 'Gate', lean: true, get: s => s.arrGate ? <span style={{ color: 'var(--cp-acc)', fontWeight: 700 }}>{s.arrGate}</span> : null },
  { id: 'callSign', label: 'ATC callsign', lean: false, get: s => s.callSign },
  { id: 'baggageBelt', label: 'Baggage belt', lean: false, get: s => s.arrBaggageBelt },
  { id: 'checkInDesk', label: 'Check-in desk', lean: false, get: s => s.depCheckInDesk },
  { id: 'runwayTime', label: 'Runway time', lean: false, get: s => s.depRunwayTime },
  { id: 'predictedTime', label: 'Predicted arr', lean: false, get: s => s.arrPredictedTime },
  { id: 'quality', label: 'Data quality', lean: false, get: s => s.quality },
  { id: 'aircraft', label: 'Aircraft', lean: false, get: s => s.aircraft },
  { id: 'codeshare', label: 'Codeshare/cargo', lean: false, get: s => s.codeshare },
  { id: 'distance', label: 'Distance', lean: false, get: s => s.distance },
  { id: 'position', label: 'Live position', lean: false, get: s => s.position },
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
      .then(raw => setStatus(normalizeFlightStatus(raw)))
      .catch(e => { if (e.name !== 'AbortError') setError(e.message || 'Failed to fetch flight status') })
      .finally(() => setLoading(false))
  }

  const cf = settings.trafficFields

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

function StatusCard({ s, cf }) {
  const items = FIELDS
    .filter(f => cf[f.id])
    .map(f => [f.label, f.get(s)])
    .filter(([, v]) => v != null)

  return (
    <div className="cp-card-accent" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--cp-acc)', letterSpacing: '0.06em' }}>{s.flight}</div>
          {s.airline && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginTop: 2 }}>{s.airline}</div>}
        </div>
        <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: s.statusColor, flexShrink: 0 }}>{s.status}</span>
      </div>

      {items.length > 0 && (
        <>
          <div style={{ borderTop: '1px solid var(--cp-border3)', margin: '12px 0' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '10px 16px' }}>
            {items.map(([k, v]) => (
              <div key={k}>
                <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--cp-dim)', marginBottom: 3 }}>{k}</div>
                <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, color: 'var(--cp-txt)' }}>{v}</div>
              </div>
            ))}
          </div>
        </>
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
