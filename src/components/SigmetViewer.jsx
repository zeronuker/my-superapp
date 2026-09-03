import React, { useState, useEffect } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { lookupAirport } from '../data/airports'
import { icaoToFir } from '../data/firLookup'
import { detectRouteFirs } from '../services/notamAPI'
import { filterSigmetsByFir } from '../utils/sigmet'
import { fetchAllSigmets } from '../services/sigmetAPI'
import { loadWithExpiry, useExpiry } from '../utils/cacheExpiry'
import ResetButton from './ResetButton'
import CopyAirportsButton from './CopyAirportsButton'
import SigmetCard from './SigmetCard'

const CACHE_KEY = 'cb-sigmet-cache'
const ERA_MAX = 5

function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch (_) {}
}

function formatAge(fetchedAtMs, nowMs) {
  if (!fetchedAtMs) return null
  const diffMin = Math.floor((nowMs - fetchedAtMs) / 60000)
  if (diffMin < 1) return 'JUST NOW'
  if (diffMin < 60) return `${diffMin} MIN AGO`
  const h = Math.floor(diffMin / 60), m = diffMin % 60
  return m > 0 ? `${h}H ${m}M AGO` : `${h}H AGO`
}

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

// JSON round-tripping through localStorage turns validFrom/validTo Date
// objects into strings — revive them so expiry checks keep working.
function reviveSigmets(sigmets) {
  return (sigmets || []).map(s => ({
    ...s,
    validFrom: s.validFrom ? new Date(s.validFrom) : null,
    validTo: s.validTo ? new Date(s.validTo) : null,
  }))
}

export default function SigmetViewer() {
  const openBriefing = useCalculatorStore(s => s.openBriefing)
  const [cache] = useState(() => loadWithExpiry(CACHE_KEY))

  const [dep, setDep] = useState(cache?.dep || '')
  const [arr, setArr] = useState(cache?.arr || '')
  const [destAlts, setDestAlts] = useState(cache?.destAlts || { alt1: '', alt2: '' })
  const [enrouteCount, setEnrouteCount] = useState(cache?.enrouteCount || 0)
  const [enrouteAlts, setEnrouteAlts] = useState(cache?.enrouteAlts || Array(ERA_MAX).fill(''))
  const [chips, setChips] = useState(cache?.chips || [])
  const [customInput, setCustomInput] = useState('')
  const [detecting, setDetecting] = useState(false)

  const [sigmets, setSigmets] = useState(() => cache?.sigmets ? reviveSigmets(cache.sigmets) : null)
  const [fetchedAt, setFetchedAt] = useState(cache?.fetchedAt || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Ticks so cached-data age and per-SIGMET expiry (validTo) stay current
  // while the tab is left open — including while offline.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    saveCache({ dep, arr, destAlts, enrouteCount, enrouteAlts, chips, sigmets, fetchedAt })
  }, [dep, arr, destAlts, enrouteCount, enrouteAlts, chips, sigmets, fetchedAt])

  const applyCopiedAirports = (data) => {
    setDep(data.dep)
    setArr(data.arr)
    setDestAlts(data.destAlts)
    setEnrouteCount(data.enrouteCount)
    setEnrouteAlts(Array.from({ length: ERA_MAX }, (_, i) => data.enrouteAlts[i] || ''))
    // FIRs were likely derived from the old route (auto-detect or manual) and
    // go stale once it's replaced — leave any manually-added standalone
    // entries alone since we can't tell them apart from route-derived ones.
  }

  const handleReset = () => {
    setDep(''); setArr('')
    setDestAlts({ alt1: '', alt2: '' })
    setEnrouteCount(0)
    setEnrouteAlts(Array(ERA_MAX).fill(''))
    setChips([]); setCustomInput('')
    setSigmets(null); setFetchedAt(null); setError('')
    try { localStorage.removeItem(CACHE_KEY) } catch (_) {}
  }

  useExpiry(fetchedAt, handleReset)

  const handleDetect = () => {
    setDetecting(true)
    const airports = [dep, arr, destAlts.alt1, destAlts.alt2, ...enrouteAlts.slice(0, enrouteCount)]
      .map(x => (x || '').trim().toUpperCase()).filter(x => x.length >= 3)
    const seen = new Set(chips.map(c => c.icao))
    const found = []
    const pushFir = (fir) => { if (fir && !seen.has(fir.icao)) { seen.add(fir.icao); found.push({ icao: fir.icao, name: fir.name }) } }
    for (const ap of airports) pushFir(icaoToFir(ap))
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
      setFetchedAt(Date.now())
    } catch (e) {
      setError(`Failed to fetch SIGMETs: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <CopyAirportsButton sourceModule="metar" sourceLabel="METAR/TAF" onApply={applyCopiedAirports} />
        <ResetButton onReset={handleReset} />
      </div>

      {!isOnline && (
        <div style={{
          background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.35)',
          borderLeft: '3px solid var(--cp-red)', borderRadius: 4, padding: '8px 14px', marginBottom: 20,
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--cp-red)', fontWeight: 700,
        }}>
          ⚠ OFFLINE
          {sigmets
            ? <span style={{ color: 'var(--cp-dim)', fontWeight: 400 }}>
                {' '}— SHOWING CACHED SIGMETs{fetchedAt ? ` · FETCHED ${formatAge(fetchedAt, now)}` : ''} · MAY BE EXPIRED
              </span>
            : <span style={{ color: 'var(--cp-dim)', fontWeight: 400 }}> — NO CACHED SIGMETs AVAILABLE, reconnect to fetch</span>
          }
        </div>
      )}

      {fetchedAt && isOnline && (
        <div style={{ fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.08em',
          fontFamily: 'var(--cb-font-mono)', marginBottom: 20 }}>
          LAST FETCH · {new Date(fetchedAt).toUTCString().toUpperCase()}
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

      {/* ── Destination Alternates ── */}
      <SectionHeader title="Destination Alternates" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[{ key: 'alt1', label: 'DEST ALT 1' }, { key: 'alt2', label: 'DEST ALT 2' }].map(({ key, label }) => (
          <div key={key}>
            <div className="cp-label" style={{ marginBottom: 4 }}>{label}</div>
            <input className="cp-input" style={{ width: '100%', fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
              placeholder="ICAO" value={destAlts[key]} maxLength={4}
              onChange={e => setDestAlts(p => ({ ...p, [key]: upper(e.target.value) }))} />
          </div>
        ))}
      </div>

      {/* ── Enroute Alternates ── */}
      <div className="cp-section-header">
        <span className="cp-section-title">Enroute Alternates</span>
        <div className="cp-divider" />
        <select value={enrouteCount} onChange={e => setEnrouteCount(Number(e.target.value))} style={{
          background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)',
          borderRadius: 4, color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)',
          fontSize: 12, padding: '7px 10px', outline: 'none', cursor: 'pointer',
        }}>
          <option value={0}>NONE</option>
          {Array.from({ length: ERA_MAX }, (_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1} AIRPORT{i > 0 ? 'S' : ''}</option>
          ))}
        </select>
      </div>
      {enrouteCount > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {Array.from({ length: enrouteCount }, (_, i) => (
            <div key={i}>
              <div className="cp-label" style={{ marginBottom: 4 }}>ERA {i + 1}</div>
              <input className="cp-input" style={{ width: '100%', fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                placeholder="ICAO" value={enrouteAlts[i] || ''} maxLength={4}
                onChange={e => setEnrouteAlts(p => { const n = [...p]; n[i] = upper(e.target.value); return n })} />
            </div>
          ))}
        </div>
      ) : <div style={{ marginBottom: 20 }} />}

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

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={handleFetch} disabled={loading || !chips.length} style={{
          flex: 1, padding: '12px', background: 'rgba(var(--cp-acc-rgb,63,224,197),0.12)',
          border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.35)', borderRadius: 6,
          cursor: chips.length ? 'pointer' : 'default', fontFamily: 'var(--cb-font-mono)', fontSize: 10,
          letterSpacing: '0.16em', color: 'var(--cp-acc)', opacity: chips.length ? 1 : 0.5 }}>
          {loading ? '⊙ FETCHING SIGMETs…' : '⊕ FETCH SIGMETs'}
        </button>
        <button onClick={() => openBriefing({ dep, arr, destAlts, enrouteCount, enrouteAlts, firs: chips })}
          disabled={!chips.length} style={{
          padding: '12px 16px', background: 'color-mix(in srgb, var(--cp-green) 18%, transparent)',
          border: '2px solid var(--cp-green)',
          borderRadius: 6, cursor: chips.length ? 'pointer' : 'default', fontFamily: 'var(--cb-font-mono)',
          fontSize: 10, letterSpacing: '0.16em', color: 'var(--cp-green)', opacity: chips.length ? 1 : 0.5 }}>
          ✈ BRIEFING
        </button>
      </div>

      {/* ── Results ── */}
      {sigmets && (
        sigmets.length === 0 ? (
          <div style={{ fontFamily: 'var(--cb-font-body)', fontSize: 13, color: 'var(--cp-dim)', textAlign: 'center', padding: '24px 0' }}>
            No active SIGMETs for the selected FIRs.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sigmets.map((s, i) => <SigmetCard key={i} s={s} now={now} />)}
          </div>
        )
      )}
    </div>
  )
}

