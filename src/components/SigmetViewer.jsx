import React, { useState, useEffect } from 'react'
import { lookupAirport } from '../data/airports'
import { icaoToFir } from '../data/firLookup'
import { detectRouteFirs } from '../services/notamAPI'
import { normalizeSigmet, filterSigmetsByFir, fmtHazard, hazardColor, fmtSigmetAlt, fmtSigmetTime } from '../utils/sigmet'
import ResetButton from './ResetButton'

function SectionHeader({ title }) {
  return (
    <div className="cp-section-header">
      <span className="cp-section-title">{title}</span>
      <div className="cp-divider" />
    </div>
  )
}

const upper = s => s.toUpperCase()
function getAirportCoords(icao) {
  const a = lookupAirport(icao)
  return a ? { lat: a.lat, lng: a.lng } : null
}

async function fetchAllSigmets(signal) {
  const res = await fetch('/api/isigmet', { signal })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `HTTP ${res.status}`)
  }
  const raw = await res.json().catch(() => [])
  return Array.isArray(raw) ? raw.map(normalizeSigmet) : []
}

export default function SigmetViewer() {
  const [dep, setDep] = useState('')
  const [arr, setArr] = useState('')
  const [chips, setChips] = useState([])
  const [customInput, setCustomInput] = useState('')
  const [detecting, setDetecting] = useState(false)

  const [sigmets, setSigmets] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const handleReset = () => {
    setDep(''); setArr(''); setChips([]); setCustomInput('')
    setSigmets(null); setError('')
  }

  const handleDetect = () => {
    setDetecting(true)
    const seen = new Set(chips.map(c => c.icao))
    const found = []
    const pushFir = (fir) => { if (fir && !seen.has(fir.icao)) { seen.add(fir.icao); found.push({ icao: fir.icao, name: fir.name }) } }
    for (const ap of [dep, arr]) { const t = ap.trim().toUpperCase(); if (t.length >= 3) pushFir(icaoToFir(t)) }
    const depC = getAirportCoords(dep), arrC = getAirportCoords(arr)
    if (depC && arrC) for (const fir of detectRouteFirs(depC, arrC)) pushFir(fir)
    setChips(prev => [...prev, ...found])
    setDetecting(false)
  }

  const addCustom = () => {
    const val = customInput.trim().toUpperCase()
    if (val.length < 3 || chips.find(c => c.icao === val)) { setCustomInput(''); return }
    // A bare airport ICAO is resolved to its home FIR — SIGMETs are FIR-scoped, not per-airport.
    const fir = icaoToFir(val)
    const entry = fir ? { icao: fir.icao, name: fir.name } : { icao: val, name: val }
    if (!chips.find(c => c.icao === entry.icao)) setChips(prev => [...prev, entry])
    setCustomInput('')
  }
  const removeChip = (icao) => setChips(c => c.filter(x => x.icao !== icao))

  const handleFetch = async () => {
    if (!chips.length) { setError('Add at least one FIR or airport.'); return }
    if (!navigator.onLine) { setError('Offline — connect to fetch current SIGMETs.'); return }
    setError(''); setLoading(true); setSigmets(null)
    try {
      const all = await fetchAllSigmets(AbortSignal.timeout(15_000))
      const firIds = new Set(chips.map(c => c.icao.toUpperCase()))
      const filtered = filterSigmetsByFir(all, firIds)
      filtered.sort((a, b) => (a.validTo?.getTime() ?? Infinity) - (b.validTo?.getTime() ?? Infinity))
      setSigmets(filtered)
    } catch (e) {
      setError(`Failed to fetch SIGMETs: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <ResetButton onReset={handleReset} />
      </div>

      {!isOnline && (
        <div style={{
          background: 'rgba(252,211,77,0.07)', border: '1px solid rgba(252,211,77,0.25)',
          borderLeft: '3px solid var(--cp-yellow)', borderRadius: 4, padding: '8px 14px', marginBottom: 20,
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--cp-yellow)',
        }}>
          ⚠ OFFLINE — SIGMETs are live-only, reconnect to fetch
        </div>
      )}

      {/* ── Route ── */}
      <SectionHeader title="Route (for auto-detecting FIRs)" />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div className="cp-label" style={{ marginBottom: 4 }}>DEPARTURE</div>
          <input className="cp-input" style={{ width: '100%', fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
            placeholder="e.g. WMKK" value={dep} maxLength={4} onChange={e => setDep(upper(e.target.value))} />
        </div>
        <button onClick={() => { setDep(arr); setArr(dep) }} title="Swap" aria-label="Swap departure and arrival"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cp-acc)',
            fontSize: 20, paddingBottom: 9, flexShrink: 0, fontFamily: 'var(--cb-font-mono)', lineHeight: 1 }}>⇄</button>
        <div style={{ flex: 1 }}>
          <div className="cp-label" style={{ marginBottom: 4 }}>ARRIVAL</div>
          <input className="cp-input" style={{ width: '100%', fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
            placeholder="e.g. RJBB" value={arr} maxLength={4} onChange={e => setArr(upper(e.target.value))} />
        </div>
      </div>

      {/* ── FIRs ── */}
      <SectionHeader title="FIRs & Manual Entries" />
      <button onClick={handleDetect} style={{
        width: '100%', marginBottom: 10,
        background: 'rgba(var(--cp-acc-rgb,63,224,197),0.06)',
        border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.25)',
        borderRadius: 6, padding: '9px', cursor: 'pointer',
        fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--cp-acc)',
      }}>
        {detecting ? '⊙ DETECTING…' : '⊕ AUTO-DETECT FIRs (ROUTE + HOME FIRs)'}
      </button>

      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {chips.map(c => (
            <div key={c.icao} style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(63,224,197,0.10)', border: '1px solid rgba(63,224,197,0.40)', borderRadius: 20, padding: '4px 8px 4px 12px' }}>
              <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--cp-acc)', letterSpacing: '0.08em' }}>{c.icao}</span>
              <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 8, color: 'var(--cp-acc)', opacity: 0.8 }}>FIR</span>
              <button onClick={() => removeChip(c.icao)} style={{ background: 'none', border: 'none',
                cursor: 'pointer', color: 'var(--cp-dim)', fontSize: 13, lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input className="cp-input" placeholder="Add ICAO airport or FIR code…" value={customInput}
          maxLength={4} onChange={e => setCustomInput(upper(e.target.value))}
          onKeyDown={e => e.key === 'Enter' && addCustom()}
          style={{ flex: 1, fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.08em' }} />
        <button onClick={addCustom} disabled={!customInput} style={{
          background: 'rgba(var(--cp-acc-rgb,63,224,197),0.1)', border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.3)',
          borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontFamily: 'var(--cb-font-mono)', fontSize: 9,
          letterSpacing: '0.12em', color: 'var(--cp-acc)', opacity: customInput ? 1 : 0.4 }}>+ ADD</button>
      </div>

      {error && (
        <div style={{ fontFamily: 'var(--cb-font-body)', fontSize: 12, color: 'var(--cp-orange)', background: 'rgba(251,146,60,0.08)',
          border: '1px solid rgba(251,146,60,0.25)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>⚠ {error}</div>
      )}

      <button onClick={handleFetch} disabled={loading || !chips.length} style={{
        width: '100%', marginBottom: 20, padding: '12px', background: 'rgba(var(--cp-acc-rgb,63,224,197),0.12)',
        border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.35)', borderRadius: 6,
        cursor: chips.length ? 'pointer' : 'default', fontFamily: 'var(--cb-font-mono)', fontSize: 10,
        letterSpacing: '0.16em', color: 'var(--cp-acc)', opacity: chips.length ? 1 : 0.5 }}>
        {loading ? '⊙ FETCHING SIGMETs…' : '⊕ FETCH SIGMETs'}
      </button>

      {/* ── Results ── */}
      {sigmets && (
        sigmets.length === 0 ? (
          <div style={{ fontFamily: 'var(--cb-font-body)', fontSize: 13, color: 'var(--cp-dim)', textAlign: 'center', padding: '24px 0' }}>
            No active SIGMETs for the selected FIRs.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sigmets.map((s, i) => <SigmetCard key={i} s={s} />)}
          </div>
        )
      )}
    </div>
  )
}

function SigmetCard({ s }) {
  const color = hazardColor(s.hazard)
  const altParts = []
  if (s.base != null) altParts.push(fmtSigmetAlt(s.base))
  if (s.top != null) altParts.push(fmtSigmetAlt(s.top))
  const altText = altParts.length === 2 ? altParts.join(' – ') : altParts.length === 1 ? `to ${altParts[0]}` : null

  const moveParts = []
  if (s.dir && s.spd) moveParts.push(`moving ${s.dir} at ${s.spd} kt`)
  if (s.chng) moveParts.push(s.chng)

  return (
    <div style={{
      background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)', borderLeft: `3px solid ${color}`,
      borderRadius: 6, padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700, color, letterSpacing: '0.08em' }}>
            {fmtHazard(s.hazard).toUpperCase()}{s.qualifier ? ` · ${s.qualifier}` : ''}
          </span>
          <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)' }}>{s.firName || s.firId}</span>
        </div>
        {(s.validFrom || s.validTo) && (
          <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.06em' }}>
            {fmtSigmetTime(s.validFrom)} – {fmtSigmetTime(s.validTo)}
          </span>
        )}
      </div>
      {(altText || moveParts.length > 0) && (
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-txt)', marginBottom: 4 }}>
          {[altText, ...moveParts].filter(Boolean).join(' · ')}
        </div>
      )}
      {s.raw && (
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: 6 }}>
          {s.raw}
        </div>
      )}
    </div>
  )
}
