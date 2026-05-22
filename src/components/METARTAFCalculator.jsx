import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'

// ── Constants ───────────────────────────────────────────────────────────────
const HOURS_OPTIONS  = [1, 2, 3, 6, 12, 24]
const ERA_MAX        = 5
const CACHE_KEY      = 'cb-metar-cache'

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatAge(unixSec, nowMs) {
  if (!unixSec) return null
  const diffMin = Math.floor((nowMs / 1000 - unixSec) / 60)
  if (diffMin < 1)  return 'JUST NOW'
  if (diffMin < 60) return `${diffMin} MIN AGO`
  const h = Math.floor(diffMin / 60), m = diffMin % 60
  return m > 0 ? `${h}H ${m}M AGO` : `${h}H AGO`
}

function parseDateStr(str) {
  if (!str) return null
  return Date.parse(str.replace(' ', 'T') + 'Z') / 1000
}

async function fetchWeather(icao, hours) {
  const [mr, tr] = await Promise.all([
    fetch(`/api/weather?ids=${icao}&type=metar&hours=${hours}`),
    fetch(`/api/weather?ids=${icao}&type=taf&hours=${hours}`),
  ])
  return {
    metar: mr.ok ? await mr.json() : [],
    taf:   tr.ok ? await tr.json() : [],
  }
}

function loadCache() {
  try { const r = localStorage.getItem(CACHE_KEY); return r ? JSON.parse(r) : null }
  catch (_) { return null }
}

function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch (_) {}
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function METARTAFCalculator() {
  const { settings, resetCount } = useCalculatorStore(s => ({
    settings:   s.settings,
    resetCount: s.resetCount,
  }))

  // Initialise state from cache (synchronous read — no flash)
  const [cache]        = useState(loadCache)
  const [dep,          setDep]          = useState(cache?.dep          || '')
  const [arr,          setArr]          = useState(cache?.arr          || '')
  const [destAlts,     setDestAlts]     = useState(cache?.destAlts     || { alt1: '', alt2: '' })
  const [enrouteCount, setEnrouteCount] = useState(cache?.enrouteCount || 0)
  const [enrouteAlts,  setEnrouteAlts]  = useState(cache?.enrouteAlts  || Array(ERA_MAX).fill(''))
  const [hours,        setHours]        = useState(cache?.hours        || settings.defaultHistory)
  const [results,      setResults]      = useState(cache?.results      || null)
  const [fetchedAt,    setFetchedAt]    = useState(cache?.fetchedAt    || null)
  const [loading,      setLoading]      = useState(false)
  const [now,          setNow]          = useState(Date.now())

  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)

  const timerRef  = useRef(null)
  const stateRef  = useRef({})

  // Keep stateRef in sync so timer callbacks always see current values
  useEffect(() => {
    stateRef.current = { dep, arr, destAlts, enrouteCount, enrouteAlts, hours }
  })

  // ── Track connectivity ─────────────────────────────────────────────────
  useEffect(() => {
    const handleOnline  = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // ── Age ticker (every 60 s) ────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // ── React to Reset All ─────────────────────────────────────────────────
  const prevReset = useRef(resetCount)
  useEffect(() => {
    if (resetCount === prevReset.current) return
    prevReset.current = resetCount
    setDep(''); setArr('')
    setDestAlts({ alt1: '', alt2: '' })
    setEnrouteCount(0)
    setEnrouteAlts(Array(ERA_MAX).fill(''))
    setHours(settings.defaultHistory)
    setResults(null)
    setFetchedAt(null)
  }, [resetCount, settings.defaultHistory])

  // ── Build ordered target list ─────────────────────────────────────────
  const buildTargets = useCallback((s) => {
    const list = []
    const add = (key, icao, label) => {
      if (!icao || typeof icao !== 'string') return
      if (icao.trim().length >= 3) list.push({ key, icao: icao.trim().toUpperCase(), label })
    }
    add('dep',  s.dep,              'DEPARTURE')
    add('arr',  s.arr,              'ARRIVAL')
    add('alt1', s.destAlts.alt1,    'DEST ALT 1')
    add('alt2', s.destAlts.alt2,    'DEST ALT 2')
    for (let i = 0; i < s.enrouteCount; i++)
      add(`era${i + 1}`, s.enrouteAlts[i] || '', `ENROUTE ALT ${i + 1}`)
    // Deduplicate by ICAO — keep first occurrence (pilot order takes priority)
    const seen = new Set()
    return list.filter(t => { if (seen.has(t.icao)) return false; seen.add(t.icao); return true })
  }, [])

  // ── Fetch ─────────────────────────────────────────────────────────────
  const doFetch = useCallback(async (s) => {
    const targets = buildTargets(s)
    if (!targets.length) return

    // Guard: if offline, show cached data and bail — no request, no iOS dialog
    if (!navigator.onLine) {
      setIsOffline(true)
      return
    }

    setIsOffline(false)
    setLoading(true)

    const out = {}
    await Promise.all(targets.map(async ({ key, icao, label }) => {
      try {
        out[key] = { icao, label, ...(await fetchWeather(icao, s.hours)), error: null }
      } catch (e) {
        out[key] = { icao, label, metar: [], taf: [], error: String(e) }
      }
    }))

    const ts = Date.now()
    setResults(out)
    setFetchedAt(ts)
    setNow(ts)
    setLoading(false)

    saveCache({ ...s, results: out, fetchedAt: ts })
  }, [buildTargets])

  const handleFetch = () => {
    if (!navigator.onLine) { setIsOffline(true); return }
    doFetch(stateRef.current)
  }

  // ── Auto-refresh at :00 and :30 ───────────────────────────────────────
  useEffect(() => {
    if (!settings.autoRefresh) return

    const schedule = () => {
      const d    = new Date()
      const mins = d.getMinutes(), secs = d.getSeconds()
      const ms   = mins < 30
        ? (30 - mins) * 60_000 - secs * 1000
        : (60 - mins) * 60_000 - secs * 1000
      timerRef.current = setTimeout(() => {
        doFetch(stateRef.current)
        schedule()
      }, ms)
    }

    schedule()
    return () => clearTimeout(timerRef.current)
  }, [settings.autoRefresh, doFetch])

  // ── Stale-on-mount check (>30 min old → refetch immediately if online) ─
  useEffect(() => {
    if (fetchedAt && Date.now() - fetchedAt > 30 * 60_000 && navigator.onLine) {
      doFetch(stateRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Ordered result keys ───────────────────────────────────────────────
  const orderedKeys = results
    ? ['dep', 'arr', 'alt1', 'alt2',
       ...Array.from({ length: enrouteCount }, (_, i) => `era${i + 1}`)]
        .filter(k => results[k])
    : []

  const hasInput = buildTargets({ dep, arr, destAlts, enrouteCount, enrouteAlts, hours }).length > 0

  // ── Shared styles ──────────────────────────────────────────────────────
  const monoInput = { fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.12em' }
  const sel = {
    background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)',
    borderRadius: 4, color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)',
    fontSize: 12, padding: '7px 10px', outline: 'none', cursor: 'pointer',
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* ── ROUTE ────────────────────────────────────────────────────────── */}
      <SectionHeader title="Route" />

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div className="cp-label" style={{ marginBottom: 4 }}>DEPARTURE</div>
          <input className="cp-input" style={monoInput} placeholder="e.g. EGLL"
            value={dep} maxLength={4}
            onChange={e => setDep(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleFetch()} />
        </div>

        <div style={{ color: 'var(--cp-acc)', fontSize: 20, paddingBottom: 9, flexShrink: 0,
          fontFamily: 'var(--cb-font-mono)' }}>✈</div>

        <div style={{ flex: 1 }}>
          <div className="cp-label" style={{ marginBottom: 4 }}>ARRIVAL</div>
          <input className="cp-input" style={monoInput} placeholder="e.g. OMDB"
            value={arr} maxLength={4}
            onChange={e => setArr(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleFetch()} />
        </div>
      </div>

      {/* ── DESTINATION ALTERNATES ───────────────────────────────────────── */}
      <SectionHeader title="Destination Alternates" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[{ key: 'alt1', label: 'DEST ALT 1' }, { key: 'alt2', label: 'DEST ALT 2' }].map(({ key, label }) => (
          <div key={key}>
            <div className="cp-label" style={{ marginBottom: 4 }}>{label}</div>
            <input className="cp-input" style={monoInput} placeholder="ICAO"
              value={destAlts[key]} maxLength={4}
              onChange={e => setDestAlts(p => ({ ...p, [key]: e.target.value.toUpperCase() }))}
              onKeyDown={e => e.key === 'Enter' && handleFetch()} />
          </div>
        ))}
      </div>

      {/* ── ENROUTE ALTERNATES ───────────────────────────────────────────── */}
      <div className="cp-section-header">
        <span className="cp-section-title">Enroute Alternates</span>
        <div className="cp-divider" />
        <select value={enrouteCount} onChange={e => setEnrouteCount(Number(e.target.value))} style={sel}>
          <option value={0}>NONE</option>
          {Array.from({ length: ERA_MAX }, (_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1} AIRPORT{i > 0 ? 'S' : ''}</option>
          ))}
        </select>
      </div>

      {enrouteCount > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 12, marginBottom: 20 }}>
          {Array.from({ length: enrouteCount }, (_, i) => (
            <div key={i}>
              <div className="cp-label" style={{ marginBottom: 4 }}>ERA {i + 1}</div>
              <input className="cp-input" style={monoInput} placeholder="ICAO"
                value={enrouteAlts[i] || ''} maxLength={4}
                onChange={e => setEnrouteAlts(p => {
                  const n = [...p]; n[i] = e.target.value.toUpperCase(); return n
                })}
                onKeyDown={e => e.key === 'Enter' && handleFetch()} />
            </div>
          ))}
        </div>
      ) : <div style={{ marginBottom: 20 }} />}

      {/* ── CONTROLS ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
        paddingTop: 14, borderTop: '1px solid var(--cp-border3)' }}>
        <span className="cp-label">METAR HISTORY</span>
        <select value={hours} onChange={e => setHours(Number(e.target.value))} style={sel}>
          {HOURS_OPTIONS.map(h => <option key={h} value={h}>{h}H</option>)}
        </select>

        {settings.autoRefresh && (
          <span style={{ fontSize: 10, color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)',
            letterSpacing: '0.1em' }}>
            AUTO :00 / :30
          </span>
        )}

        <button className="cp-btn" onClick={handleFetch}
          disabled={!hasInput || loading}
          style={{
            marginLeft: 'auto',
            borderColor: hasInput && !loading ? 'var(--cp-acc)' : undefined,
            color:       hasInput && !loading ? 'var(--cp-acc)' : undefined,
            opacity: loading ? 0.6 : 1,
            letterSpacing: '0.15em', minWidth: 152,
          }}>
          {loading ? 'FETCHING…' : '⟳  FETCH WEATHER'}
        </button>
      </div>

      {/* ── OFFLINE BANNER ──────────────────────────────────────────────── */}
      {isOffline && (
        <div style={{
          background: 'rgba(252,211,77,0.07)',
          border: '1px solid rgba(252,211,77,0.25)',
          borderLeft: '3px solid var(--cp-yellow)',
          borderRadius: 4, padding: '8px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--cb-font-mono)', fontSize: 11,
          letterSpacing: '0.12em', color: 'var(--cp-yellow)',
        }}>
          ⚠ OFFLINE
          {results
            ? <span style={{ color: 'var(--cp-dim)' }}>
                · SHOWING CACHED DATA
                {fetchedAt ? ` · CACHED ${formatAge(fetchedAt / 1000, now)}` : ''}
              </span>
            : <span style={{ color: 'var(--cp-dim)' }}>· NO CACHED DATA AVAILABLE</span>
          }
        </div>
      )}

      {/* ── FETCH TIMESTAMP ─────────────────────────────────────────────── */}
      {fetchedAt && !isOffline && (
        <div style={{ fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.08em',
          fontFamily: 'var(--cb-font-mono)', marginBottom: 24 }}>
          LAST FETCH · {new Date(fetchedAt).toUTCString().toUpperCase()}
        </div>
      )}

      {/* ── RESULTS ─────────────────────────────────────────────────────── */}
      {results && orderedKeys.map(key => (
        <AirportCard key={key} data={results[key]} now={now} />
      ))}

      {!results && !loading && (
        <div style={{ textAlign: 'center', color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)',
          fontSize: 11, letterSpacing: '0.14em', paddingTop: 32 }}>
          ENTER ICAO CODES AND FETCH
        </div>
      )}
    </div>
  )
}

// ── Section header helper ───────────────────────────────────────────────────
function SectionHeader({ title }) {
  return (
    <div className="cp-section-header">
      <span className="cp-section-title">{title}</span>
      <div className="cp-divider" />
    </div>
  )
}

// ── Role colour map ─────────────────────────────────────────────────────────
// dep/arr → cyan · dest alt → white · enroute alt → purple
function getRoleStyle(label) {
  if (label === 'DEPARTURE' || label === 'ARRIVAL') {
    return {
      color:        '#06b6d4',
      bgLatest:     'rgba(6,182,212,0.10)',
      bgDim:        'rgba(6,182,212,0.04)',
      borderLatest: 'rgba(6,182,212,0.45)',
      borderDim:    'rgba(6,182,212,0.18)',
      textDim:      'rgba(6,182,212,0.50)',
    }
  }
  if (label.startsWith('DEST ALT')) {
    return {
      color:        '#e2e8f0',
      bgLatest:     'rgba(226,232,240,0.08)',
      bgDim:        'rgba(226,232,240,0.03)',
      borderLatest: 'rgba(226,232,240,0.32)',
      borderDim:    'rgba(226,232,240,0.12)',
      textDim:      'rgba(226,232,240,0.45)',
    }
  }
  // Enroute alternates
  return {
    color:        '#a78bfa',
    bgLatest:     'rgba(167,139,250,0.10)',
    bgDim:        'rgba(167,139,250,0.04)',
    borderLatest: 'rgba(167,139,250,0.45)',
    borderDim:    'rgba(167,139,250,0.18)',
    textDim:      'rgba(167,139,250,0.50)',
  }
}

// ── Airport result card ─────────────────────────────────────────────────────
function AirportCard({ data, now }) {
  const { icao, label, metar, taf, error } = data
  const role         = getRoleStyle(label)
  const stationName  = metar?.[0]?.name || ''
  const latestMetar  = metar?.[0]
  const metarAge     = latestMetar ? formatAge(latestMetar.obsTime, now) : null
  const latestTaf    = taf?.[0]
  const tafIssueSec  = latestTaf
    ? (parseDateStr(latestTaf.issueTime) || parseDateStr(latestTaf.bulletinTime))
    : null
  const tafAge = tafIssueSec ? formatAge(tafIssueSec, now) : null

  return (
    <div style={{ marginBottom: 28 }}>

      {/* Card header */}
      <div className="cp-section-header" style={{ flexWrap: 'wrap', gap: 6 }}>
        <span className="cp-section-title" style={{ fontSize: 12, color: role.color }}>
          {label} · {icao}
        </span>
        {stationName && (
          <span style={{ fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.08em',
            fontFamily: 'var(--cb-font-mono)' }}>
            {stationName.toUpperCase()}
          </span>
        )}
        <div className="cp-divider" style={{ borderColor: role.borderDim }} />
      </div>

      {error ? (
        <div style={{ color: 'var(--cp-red)', fontFamily: 'var(--cb-font-mono)',
          fontSize: 12, padding: '6px 0 12px', letterSpacing: '0.08em' }}>
          ERROR · {error}
        </div>
      ) : (
        <>
          {/* ── METAR ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span className="cp-label">
                METAR · {metar.length} REPORT{metar.length !== 1 ? 'S' : ''}
              </span>
              {metarAge && (
                <span style={{ fontSize: 10, letterSpacing: '0.1em',
                  fontFamily: 'var(--cb-font-mono)', color: role.color }}>
                  LATEST · {metarAge}
                </span>
              )}
            </div>

            {metar.length === 0
              ? <div style={{ color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)', fontSize: 12 }}>NO METAR DATA</div>
              : metar.map((m, i) => (
                <div key={i} style={{
                  background: i === 0 ? role.bgLatest : role.bgDim,
                  border: `1px solid ${i === 0 ? role.borderLatest : role.borderDim}`,
                  borderLeft: `3px solid ${i === 0 ? role.color : role.borderDim}`,
                  borderRadius: 4, padding: '8px 12px', marginBottom: 4,
                }}>
                  {i === 0 && (
                    <div style={{ fontSize: 9, color: role.color,
                      letterSpacing: '0.2em', marginBottom: 3 }}>LATEST</div>
                  )}
                  <div style={{
                    fontFamily: 'var(--cb-font-mono)', fontSize: 12, lineHeight: 1.6,
                    color: i === 0 ? role.color : role.textDim,
                    wordBreak: 'break-all',
                  }}>
                    {m.rawOb || '—'}
                  </div>
                </div>
              ))
            }
          </div>

          {/* ── TAF ── */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span className="cp-label">
                TAF · {taf.length} REPORT{taf.length !== 1 ? 'S' : ''}
              </span>
              {tafAge && (
                <span style={{ fontSize: 10, letterSpacing: '0.1em',
                  fontFamily: 'var(--cb-font-mono)', color: role.color }}>
                  ISSUED · {tafAge}
                </span>
              )}
            </div>

            {taf.length === 0
              ? <div style={{ color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)', fontSize: 12 }}>NO TAF DATA</div>
              : taf.map((t, i) => (
                <div key={i} style={{
                  background: i === 0 ? role.bgLatest : role.bgDim,
                  border: `1px solid ${i === 0 ? role.borderLatest : role.borderDim}`,
                  borderLeft: `3px solid ${i === 0 ? role.color : role.borderDim}`,
                  borderRadius: 4, padding: '10px 12px', marginBottom: 4,
                  fontFamily: 'var(--cb-font-mono)', fontSize: 12, lineHeight: 1.8,
                  color: i === 0 ? role.color : role.textDim,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {t.rawTAF || '—'}
                </div>
              ))
            }
          </div>
        </>
      )}
    </div>
  )
}
