import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { haptic } from '../utils/haptic'
import {
  CAT_COLORS, WIND_COLORS,
  getMetarFlightCat, getWindSev,
  tokenizeRaw, parseTafSegments,
} from '../utils/metarSeverity'
import { decodeMetar, decodeTaf } from '../utils/metarDecode'
import { skylinkMetarToAWCShape, skylinkTafToAWCShape } from '../utils/skylinkWeather'
import { isSkyLinkDay } from '../utils/sourceSwitch'
import { normalizeRunways, windComponents, fmtWindComponent, windSeverity } from '../utils/runways'
import { fmtTrack } from '../utils/traffic'
import { ROLE_TINT } from '../utils/roleStyle'
import ResetButton from './ResetButton'
import CopyAirportsButton from './CopyAirportsButton'
import RadarSweepLoader, { computeAnimDuration } from './RadarSweepLoader'
import SourceChip from './SourceChip'
import { loadWithExpiry, useExpiry } from '../utils/cacheExpiry'

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

async function fetchWeatherFromAWC(icao, hours) {
  const [mr, tr] = await Promise.all([
    fetch(`/api/weather?ids=${icao}&type=metar&hours=${hours}`),
    fetch(`/api/weather?ids=${icao}&type=taf&hours=${hours}`),
  ])
  if (!mr.ok && !tr.ok) throw new Error('Weather request failed')
  return {
    metar: mr.ok ? await mr.json() : [],
    taf:   tr.ok ? await tr.json() : [],
  }
}
async function fetchWeatherFromSkylink(icao) {
  const [mr, tr] = await Promise.all([
    fetch(`/api/skylink?resource=metar&icao=${icao}`),
    fetch(`/api/skylink?resource=taf&icao=${icao}`),
  ])
  if (!mr.ok && !tr.ok) throw new Error('SkyLink weather request failed')
  const metarRaw = mr.ok ? await mr.json().catch(() => null) : null
  const tafRaw   = tr.ok ? await tr.json().catch(() => null) : null
  const metar = skylinkMetarToAWCShape(metarRaw)
  const taf   = skylinkTafToAWCShape(tafRaw)
  return { metar: metar ? [metar] : [], taf: taf ? [taf] : [] }
}
async function fetchRunways(icao, signal) {
  const res = await fetch(`/api/aerodatabox?icao=${encodeURIComponent(icao)}`, { signal })
  if (!res.ok) throw new Error('Runway request failed')
  return normalizeRunways(await res.json().catch(() => null))
}
// UTC even/odd day picks the source (see utils/sourceSwitch); if the
// scheduled one fails outright, silently retry with the other rather than
// surfacing an error the user can't act on.
async function fetchWeather(icao, hours) {
  const preferSkylink = isSkyLinkDay()
  try {
    const out = preferSkylink ? await fetchWeatherFromSkylink(icao) : await fetchWeatherFromAWC(icao, hours)
    return { ...out, source: preferSkylink ? 'skylink' : 'aviationweather' }
  } catch (e) {
    const out = preferSkylink ? await fetchWeatherFromAWC(icao, hours) : await fetchWeatherFromSkylink(icao)
    return { ...out, source: preferSkylink ? 'aviationweather' : 'skylink' }
  }
}

function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch (_) {}
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function METARTAFCalculator() {
  const { settings } = useCalculatorStore(s => ({
    settings: s.settings,
  }))

  // Initialise state from cache (synchronous read — no flash)
  const [cache]        = useState(() => loadWithExpiry(CACHE_KEY))
  const [dep,          setDep]          = useState(cache?.dep          || '')
  const [arr,          setArr]          = useState(cache?.arr          || '')
  const [destAlts,     setDestAlts]     = useState(cache?.destAlts     || { alt1: '', alt2: '' })
  const [enrouteCount, setEnrouteCount] = useState(cache?.enrouteCount || 0)
  const [enrouteAlts,  setEnrouteAlts]  = useState(cache?.enrouteAlts  || Array(ERA_MAX).fill(''))
  const [hours,        setHours]        = useState(cache?.hours        || settings.defaultHistory)
  const [results,      setResults]      = useState(cache?.results      || null)
  const [fetchedAt,    setFetchedAt]    = useState(cache?.fetchedAt    || null)
  const [loading,      setLoading]      = useState(false)
  const [manualFetch,  setManualFetch]  = useState(false)
  const [activeTargets, setActiveTargets] = useState([])
  const [now,          setNow]          = useState(Date.now())

  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)

  const timerRef  = useRef(null)
  const stateRef  = useRef({})

  // Keep stateRef in sync so timer callbacks always see current values
  useEffect(() => {
    stateRef.current = { dep, arr, destAlts, enrouteCount, enrouteAlts, hours }
  })

  // Persist airport inputs as they're typed (not just after a fetch) so the
  // NOTAM module's copy-airports button always sees current values
  useEffect(() => {
    saveCache({ dep, arr, destAlts, enrouteCount, enrouteAlts, hours, results, fetchedAt })
  }, [dep, arr, destAlts, enrouteCount, enrouteAlts, hours, results, fetchedAt])

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

  // ── Age ticker (every 60 s) — only ticks when online ──────────────────
  useEffect(() => {
    if (isOffline) return
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [isOffline])

  // ── Copy airports from NOTAM module ─────────────────────────────────────
  const applyCopiedAirports = (data) => {
    setDep(data.dep)
    setArr(data.arr)
    setDestAlts(data.destAlts)
    setEnrouteCount(data.enrouteCount)
    setEnrouteAlts(Array.from({ length: ERA_MAX }, (_, i) => data.enrouteAlts[i] || ''))
  }

  // ── Reset this tab ──────────────────────────────────────────────────────
  const handleReset = () => {
    setDep(''); setArr('')
    setDestAlts({ alt1: '', alt2: '' })
    setEnrouteCount(0)
    setEnrouteAlts(Array(ERA_MAX).fill(''))
    setHours(settings.defaultHistory)
    setResults(null)
    setFetchedAt(null)
    try { localStorage.removeItem(CACHE_KEY) } catch (_) {}
  }

  useExpiry(fetchedAt, handleReset)

  // ── Sync hours when defaultHistory setting changes (e.g. after import) ──
  const prevDefaultHistory = useRef(settings.defaultHistory)
  useEffect(() => {
    if (settings.defaultHistory === prevDefaultHistory.current) return
    prevDefaultHistory.current = settings.defaultHistory
    setHours(settings.defaultHistory)
  }, [settings.defaultHistory])

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
  // `isManual` is true only when the user hits the fetch button themselves —
  // it drives the radar-sweep loading animation. Auto-refresh and the
  // back-online silent refetch call this without it, so they keep the
  // existing behaviour of refreshing quietly behind the stale data.
  const doFetch = useCallback(async (s, isManual = false) => {
    const targets = buildTargets(s)
    if (!targets.length) return

    // Guard: if offline, show cached data and bail — no request, no iOS dialog
    if (!navigator.onLine) {
      setIsOffline(true)
      return
    }

    setIsOffline(false)
    setLoading(true)
    const startedAt = Date.now()
    if (isManual) {
      setActiveTargets(targets.map(t => t.icao))
      setManualFetch(true)
    }

    const out = {}
    await Promise.all(targets.map(async ({ key, icao, label }) => {
      try {
        out[key] = { icao, label, ...(await fetchWeather(icao, s.hours)), error: null }
      } catch (e) {
        out[key] = { icao, label, metar: [], taf: [], error: String(e) }
      }
    }))

    const hasError = Object.values(out).some(v => v.error)

    const reveal = () => {
      const ts = Date.now()
      setResults(out)
      setFetchedAt(ts)
      setNow(ts)
      setLoading(false)
      if (isManual) setManualFetch(false)
      haptic(hasError ? 'heavy' : 'medium')
    }

    // The animation always finishes before results are revealed — unless a
    // target errored, in which case surface it immediately rather than
    // sitting through the rest of the cosmetic scan.
    if (isManual && !hasError) {
      const remaining = computeAnimDuration(targets.length) - (Date.now() - startedAt)
      if (remaining > 0) { setTimeout(reveal, remaining); return }
    }
    reveal()
  }, [buildTargets])

  const handleFetch = () => {
    if (!navigator.onLine) { setIsOffline(true); return }
    doFetch(stateRef.current, true)
  }

  // ── Back-online silent refetch ─────────────────────────────────────────
  // When device transitions offline → online, immediately refresh if inputs exist.
  // `stateRef.current` has live values so no stale-closure risk. Placed after
  // doFetch is declared to avoid a temporal-dead-zone reference in the deps.
  const wasOffline = useRef(null)
  useEffect(() => {
    if (wasOffline.current === null) { wasOffline.current = isOffline; return }
    if (wasOffline.current && !isOffline) {
      const s = stateRef.current
      if (s.dep || s.arr) doFetch(s)
    }
    wasOffline.current = isOffline
  }, [isOffline, doFetch])

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
        const s = stateRef.current
        if (s.dep || s.arr || s.destAlts?.alt1 || s.destAlts?.alt2) doFetch(s)
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <CopyAirportsButton sourceModule="notam" sourceLabel="NOTAM" onApply={applyCopiedAirports} />
        <ResetButton onReset={handleReset} />
      </div>

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

        <button
          onClick={() => { setDep(arr); setArr(dep) }}
          title="Swap departure and arrival"
          aria-label="Swap departure and arrival"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--cp-acc)', fontSize: 20, paddingBottom: 9, flexShrink: 0,
            fontFamily: 'var(--cb-font-mono)', lineHeight: 1,
          }}
        >⇄</button>

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

      {/* ── COLOUR LEGEND ───────────────────────────────────────────────── */}
      {results && !manualFetch && <SeverityLegend />}

      {/* ── LOADING ──────────────────────────────────────────────────────── */}
      {manualFetch && <RadarSweepLoader targets={activeTargets} />}

      {/* ── RESULTS ─────────────────────────────────────────────────────── */}
      {results && !manualFetch && orderedKeys.map(key => (
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
      color:        ROLE_TINT.dep.color,
      bgLatest:     ROLE_TINT.dep.soft,
      bgDim:        'rgba(6,182,212,0.04)',
      borderLatest: 'rgba(6,182,212,0.45)',
      borderDim:    'rgba(6,182,212,0.18)',
      textDim:      'rgba(6,182,212,0.50)',
    }
  }
  if (label.startsWith('DEST ALT')) {
    return {
      color:        ROLE_TINT.destalt.color,
      bgLatest:     ROLE_TINT.destalt.soft,
      bgDim:        'rgba(226,232,240,0.03)',
      borderLatest: 'rgba(226,232,240,0.32)',
      borderDim:    'rgba(226,232,240,0.12)',
      textDim:      'rgba(226,232,240,0.45)',
    }
  }
  // Enroute alternates
  return {
    color:        ROLE_TINT.era.color,
    bgLatest:     ROLE_TINT.era.soft,
    bgDim:        'rgba(167,139,250,0.04)',
    borderLatest: 'rgba(167,139,250,0.45)',
    borderDim:    'rgba(167,139,250,0.18)',
    textDim:      'rgba(167,139,250,0.50)',
  }
}

// ── Severity colour legend ──────────────────────────────────────────────────
function SeverityLegend() {
  const CATS = [
    { color: '#22c55e', label: 'VFR',  sub: '>3000ft  ≥8000m'      },
    { color: '#60a5fa', label: 'MVFR', sub: '1–3000ft  5000–7999m' },
    { color: '#f87171', label: 'IFR',  sub: '500–999ft  1500–4999m' },
    { color: '#e879f9', label: 'LIFR', sub: '<500ft  <1500m'        },
  ]
  const WINDS = [
    { color: '#fbbf24', label: 'STRONG WIND', sub: '≥20kt / gust ≥25kt' },
    { color: '#f87171', label: 'SEVERE WIND', sub: '≥35kt / gust ≥45kt' },
  ]
  const WX = [
    { color: '#facc15', label: 'PRESENT WEATHER', sub: 'RA  SN  FG  TS  FZRA  GR  CB  TCU  etc.' },
  ]

  const dot = color => (
    <span style={{
      display: 'inline-block', width: 8, height: 8,
      borderRadius: '50%', background: color, flexShrink: 0,
    }} />
  )

  return (
    <div className="cp-card-bg3" style={{
      border: '1px solid var(--cp-border)',
      borderRadius: 6, padding: '10px 14px',
      marginBottom: 20,
    }}>
      {/* Flight category row */}
      <div style={{
        fontFamily: 'var(--cb-font-mono)', fontSize: 9,
        letterSpacing: '0.14em', color: 'var(--cp-dim)',
        marginBottom: 7,
      }}>
        FLIGHT CATEGORY
      </div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '6px 18px',
        marginBottom: 10,
      }}>
        {CATS.map(({ color, label, sub }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {dot(color)}
            <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11,
              fontWeight: 700, color, letterSpacing: '0.08em' }}>{label}</span>
            <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9,
              color: 'var(--cp-dim)', letterSpacing: '0.06em' }}>{sub}</span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--cp-border3)', marginBottom: 8 }} />

      {/* Wind severity row */}
      <div style={{
        fontFamily: 'var(--cb-font-mono)', fontSize: 9,
        letterSpacing: '0.14em', color: 'var(--cp-dim)',
        marginBottom: 7,
      }}>
        WIND SEVERITY
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginBottom: 10 }}>
        {WINDS.map(({ color, label, sub }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {dot(color)}
            <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11,
              fontWeight: 700, color, letterSpacing: '0.08em' }}>{label}</span>
            <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9,
              color: 'var(--cp-dim)', letterSpacing: '0.06em' }}>{sub}</span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--cp-border3)', marginBottom: 8 }} />

      {/* Weather phenomena row */}
      <div style={{
        fontFamily: 'var(--cb-font-mono)', fontSize: 9,
        letterSpacing: '0.14em', color: 'var(--cp-dim)',
        marginBottom: 7,
      }}>
        WEATHER PHENOMENA
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
        {WX.map(({ color, label, sub }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {dot(color)}
            <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11,
              fontWeight: 700, color, letterSpacing: '0.08em' }}>{label}</span>
            <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9,
              color: 'var(--cp-dim)', letterSpacing: '0.06em' }}>{sub}</span>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div style={{
        marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--cp-border3)',
        fontFamily: 'var(--cb-font-mono)', fontSize: 9,
        color: 'var(--cp-dim)', letterSpacing: '0.06em', lineHeight: 1.6,
      }}>
        COLOURS APPLY TO LATEST REPORT ONLY · WIND TOKEN COLOURED INDEPENDENTLY · TEMPO/PROB AT 70% OPACITY
      </div>
    </div>
  )
}

// ── Airport result card ─────────────────────────────────────────────────────
function AirportCard({ data, now }) {
  const { icao, label, metar, taf, error, source } = data
  const [decoded, setDecoded] = useState(false)
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
        {!error && source && <SourceChip source={source} />}
        <div className="cp-divider" style={{ borderColor: role.borderDim }} />
        {!error && (metar?.length || taf?.length) ? (
          <button
            onClick={() => setDecoded(v => !v)}
            style={{
              flexShrink: 0,
              background: decoded ? role.bgLatest : 'transparent',
              border: `1px solid ${decoded ? role.color : role.borderDim}`,
              borderRadius: 4, padding: '3px 10px', cursor: 'pointer',
              fontFamily: 'var(--cb-font-mono)', fontSize: 9, fontWeight: 700,
              letterSpacing: '0.12em',
              color: decoded ? role.color : 'var(--cp-dim)',
              transition: 'all 0.12s',
            }}
            title={decoded ? 'Show raw report' : 'Decode to plain English'}
          >
            {decoded ? '⊟ RAW' : '⊞ DECODE'}
          </button>
        ) : null}
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
              : metar.map((m, i) => {
                // Latest report: severity colour coding
                // Older reports: existing dimmed role colour (no change)
                let textContent
                if (i === 0) {
                  const cat      = getMetarFlightCat(m)
                  const catColor = cat ? CAT_COLORS[cat] : role.color
                  const windSev  = getWindSev(m.wspd, m.wgst)
                  const windColor = windSev !== 'NORMAL' ? WIND_COLORS[windSev] : null
                  const tokens   = tokenizeRaw(m.rawOb, catColor, windColor)
                  textContent = tokens.map((tok, j) => (
                    <span key={j} style={{ color: tok.color }}>{tok.text}</span>
                  ))
                } else {
                  textContent = <span style={{ color: role.textDim }}>{m.rawOb || '—'}</span>
                }
                return (
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
                      wordBreak: 'break-all',
                    }}>
                      {textContent}
                    </div>
                  </div>
                )
              })
            }

            {decoded && latestMetar && (
              <DecodeBox role={role}>
                {decodeMetar(latestMetar).map((r, i) => (
                  <DecodeRow key={i} label={r.label} value={r.value} role={role} />
                ))}
              </DecodeBox>
            )}
          </div>

          <RunwaysSection icao={icao} role={role}
            windDirDeg={typeof latestMetar?.wdir === 'number' ? latestMetar.wdir : null}
            windSpeedKt={typeof latestMetar?.wspd === 'number' ? latestMetar.wspd : null} />

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
              : taf.map((t, i) => {
                // Latest TAF: parse into forecast segments and colour each independently
                // Older TAFs: existing dimmed role colour (no change)
                let tafContent
                if (i === 0) {
                  const segments = parseTafSegments(t.rawTAF)
                  if (segments && segments.length > 0) {
                    tafContent = segments.map((seg, si) => (
                      <div key={si} style={{ opacity: seg.isTemporal ? 0.7 : 1 }}>
                        {seg.tokens.map((tok, j) => (
                          <span key={j} style={{ color: tok.color }}>{tok.text}</span>
                        ))}
                      </div>
                    ))
                  } else {
                    // Fallback if parse yields nothing
                    tafContent = <span style={{ color: role.color }}>{t.rawTAF || '—'}</span>
                  }
                } else {
                  tafContent = <span style={{ color: role.textDim }}>{t.rawTAF || '—'}</span>
                }
                return (
                  <div key={i} style={{
                    background: i === 0 ? role.bgLatest : role.bgDim,
                    border: `1px solid ${i === 0 ? role.borderLatest : role.borderDim}`,
                    borderLeft: `3px solid ${i === 0 ? role.color : role.borderDim}`,
                    borderRadius: 4, padding: '10px 12px', marginBottom: 4,
                    fontFamily: 'var(--cb-font-mono)', fontSize: 12, lineHeight: 1.8,
                    wordBreak: 'break-word',
                  }}>
                    {i === 0 && (
                      <div style={{ fontSize: 9, color: role.color,
                        letterSpacing: '0.2em', marginBottom: 3 }}>LATEST</div>
                    )}
                    {tafContent}
                  </div>
                )
              })
            }

            {decoded && latestTaf && (() => {
              const segs = decodeTaf(latestTaf.rawTAF)
              if (!segs) return null
              return (
                <DecodeBox role={role}>
                  {segs.map((seg, si) => (
                    <div key={si} style={{
                      marginBottom: si < segs.length - 1 ? 10 : 0,
                      opacity: seg.isTemporal ? 0.78 : 1,
                    }}>
                      <div style={{
                        fontFamily: 'var(--cb-font-mono)', fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.1em', color: role.color, marginBottom: 3,
                      }}>
                        {seg.header}
                      </div>
                      {seg.items.map((it, j) => (
                        <div key={j} style={{
                          fontFamily: 'var(--cb-font-body)', fontSize: 12,
                          color: 'var(--cp-txt)', lineHeight: 1.5, paddingLeft: 10,
                        }}>
                          {it}
                        </div>
                      ))}
                    </div>
                  ))}
                </DecodeBox>
              )
            })()}
          </div>
        </>
      )}
    </div>
  )
}

// ── Decoded-report panel helpers ─────────────────────────────────────────────
// ── Runways (AeroDataBox) ────────────────────────────────────────────────────
const WIND_SEVERITY_COLOR = {
  closed: 'var(--cp-dim)', none: 'var(--cp-dim)',
  crosswind: 'var(--cp-orange)', tailwind: 'var(--cp-red)', headwind: 'var(--cp-green)',
}
// Collapsed by default — layout rarely matters until a pilot wants it, and
// fetching lazily on expand avoids a call per card on every page load.
function RunwaysSection({ icao, role, windDirDeg, windSpeedKt }) {
  const [open, setOpen] = useState(false)
  const [runways, setRunways] = useState(null) // null | 'loading' | array | 'error'
  // Tracks which icao the current `runways` value is actually for — a card
  // slot (dep/arr/alt/enroute) can be re-pointed at a different airport
  // without remounting, so `open` alone isn't enough to know whether to fetch.
  const fetchedIcaoRef = useRef(null)

  useEffect(() => {
    if (!open || fetchedIcaoRef.current === icao) return
    const controller = new AbortController()
    setRunways('loading')
    fetchRunways(icao, controller.signal)
      .then(r => { fetchedIcaoRef.current = icao; setRunways(r) })
      .catch(e => {
        if (e.name === 'AbortError') return // closed mid-fetch — retry on next open, don't stick in 'error'
        fetchedIcaoRef.current = icao
        setRunways('error')
      })
    return () => controller.abort()
  }, [open, icao])

  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8,
      }}>
        <span className="cp-label">RUNWAYS</span>
        <span style={{
          fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)',
          border: `1px solid ${role.borderDim}`, borderRadius: 4, padding: '2px 7px',
        }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        runways === 'loading' ? (
          <div style={{ color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)', fontSize: 12 }}>Loading…</div>
        ) : runways === 'error' ? (
          <div style={{ color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)', fontSize: 12 }}>Runway data unavailable</div>
        ) : Array.isArray(runways) && runways.length === 0 ? (
          <div style={{ color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)', fontSize: 12 }}>No runway data for this airport</div>
        ) : Array.isArray(runways) ? (
          <table className="cp-table" style={{ width: '100%' }}>
            <thead><tr><th>Rwy</th><th>Hdg</th><th>Length</th><th>Surface</th><th>Wind</th></tr></thead>
            <tbody>
              {runways.map(r => {
                const wc = !r.closed ? windComponents(windDirDeg, windSpeedKt, r.headingDeg) : null
                const label = fmtWindComponent(wc)
                const windColor = WIND_SEVERITY_COLOR[windSeverity(wc, r.closed)]
                return (
                  <tr key={r.name} style={r.closed ? { opacity: 0.45 } : undefined}>
                    <td style={{ fontFamily: 'var(--cb-font-mono)', fontWeight: 700 }}>{r.name}</td>
                    <td>{r.headingDeg != null ? fmtTrack(r.headingDeg) : '—'}</td>
                    <td>{r.lengthM != null ? `${r.lengthM.toLocaleString()} m` : '—'}</td>
                    <td>{r.surface}</td>
                    <td style={{ color: windColor }}>{r.closed ? 'CLOSED' : label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : null
      )}
    </div>
  )
}

function DecodeBox({ role, children }) {
  return (
    <div className="cp-card-bg3" style={{
      marginTop: 6,
      border: `1px solid ${role.borderDim}`,
      borderLeft: `3px solid ${role.color}`,
      borderRadius: 4, padding: '10px 14px',
    }}>
      <div style={{
        fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.18em',
        color: 'var(--cp-dim)', marginBottom: 8,
      }}>
        DECODED
      </div>
      {children}
    </div>
  )
}

function DecodeRow({ label, value, role }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 5, alignItems: 'baseline' }}>
      <span style={{
        flexShrink: 0, width: 96,
        fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.08em',
        color: role.color,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--cb-font-body)', fontSize: 12,
        color: 'var(--cp-txt)', lineHeight: 1.5,
      }}>
        {value}
      </span>
    </div>
  )
}
