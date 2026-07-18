import React, { useState, useEffect } from 'react'
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

export default function TrafficViewer() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
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

  const handleReset = () => { setQuery(''); setStatus(null); setError(''); setSearched(false) }

  // Debounced lookup — refires as the user types, cancels the in-flight
  // request on the next keystroke.
  useEffect(() => {
    if (isOffline) return
    const term = query.trim()
    if (term.length < 2) { setStatus(null); setError(''); setSearched(false); return }
    const controller = new AbortController()
    const t = setTimeout(() => {
      setLoading(true); setError(''); setSearched(true)
      fetchFlightStatus(term, controller.signal)
        .then(raw => setStatus(normalizeFlightStatus(raw)))
        .catch(e => { if (e.name !== 'AbortError') setError(e.message || 'Failed to fetch flight status') })
        .finally(() => setLoading(false))
    }, 400)
    return () => { clearTimeout(t); controller.abort() }
  }, [query, isOffline])

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
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
            placeholder="🔍 Callsign or flight number, e.g. MAS123"
            value={query} onChange={e => setQuery(e.target.value)} />
          {query && (
            <button className="cp-btn" style={{ padding: '7px 10px', flexShrink: 0 }} onClick={() => setQuery('')}>✕</button>
          )}
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
            TYPE A CALLSIGN OR FLIGHT NUMBER TO CHECK STATUS
          </div>
        )}

        {!loading && status && <StatusCard s={status} />}

      </div>
    </div>
  )
}

function StatusCard({ s }) {
  const items = []
  if (s.route) items.push(['Route', s.route])
  if (s.schedArr) items.push(['Sched arr', s.schedArr])
  if (s.estArr) items.push(['Actual/est arr', s.estArr])
  const delayLabel = fmtDelay(s.delayMinutes)
  if (delayLabel) items.push(['Delay', <span style={{ color: s.delayMinutes > 0 ? 'var(--cp-orange)' : 'var(--cp-txt)' }}>{delayLabel}</span>])
  if (s.arrTerminal) items.push(['Terminal', s.arrTerminal])
  if (s.arrGate) items.push(['Gate', <span style={{ color: 'var(--cp-acc)', fontWeight: 700 }}>{s.arrGate}</span>])

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
