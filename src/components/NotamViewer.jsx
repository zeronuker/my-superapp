import React, { useState, useMemo, useEffect, useRef } from 'react'
import { fetchNotams, parseRawNotams, detectRouteFirs, NOTAM_CATEGORIES } from '../services/notamAPI'
import { useCalculatorStore } from '../store/calculatorStore'
import { lookupAirport } from '../data/airports'
import { icaoToFir } from '../data/firLookup'
import { haptic } from '../utils/haptic'

// ── Tokens ────────────────────────────────────────────────────────────────────
const T = {
  mono: 'var(--cb-font-mono)', sans: 'var(--cb-font-body)',
  acc: 'var(--cp-acc)', dim: 'var(--cp-dim)', ink: 'var(--cp-txt)', ink2: 'var(--cp-muted)',
  bg1: 'var(--cp-bg3)', bord: 'var(--cp-border)', bord2: 'var(--cp-border2)',
  green: '#22c55e', orange: 'var(--cp-orange, #fb923c)',
}

const ERA_MAX = 5
const CACHE_KEY = 'cb-notam-cache'
function loadCache() {
  try { const r = localStorage.getItem(CACHE_KEY); return r ? JSON.parse(r) : null }
  catch (_) { return null }
}
function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch (_) {}
}
const CATEGORY_ORDER = ['AERODROME', 'AIRSPACE', 'NAVAID', 'OBSTACLE', 'WARNING', 'LIGHTING', 'PROCEDURE', 'OTHER']
const STATUS_RANK = { ACTIVE: 0, FUTURE: 1, EXPIRED: 2, UNKNOWN: 3 }

// Role → colour (dep/arr cyan · dest-alt white · enroute purple · FIR amber · other gray)
const ROLE_STYLE = {
  dep:     { color: '#06b6d4', soft: 'rgba(6,182,212,0.10)',   border: 'rgba(6,182,212,0.40)' },
  arr:     { color: '#06b6d4', soft: 'rgba(6,182,212,0.10)',   border: 'rgba(6,182,212,0.40)' },
  destalt: { color: '#e2e8f0', soft: 'rgba(226,232,240,0.08)', border: 'rgba(226,232,240,0.35)' },
  era:     { color: '#a78bfa', soft: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.40)' },
  fir:     { color: '#fbbf24', soft: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.40)' },
  other:   { color: '#94a3b8', soft: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.35)' },
}

function getAirportCoords(icao) {
  const a = lookupAirport(icao)
  return a ? { lat: a.lat, lng: a.lng } : null
}

// ── Sort helpers ──────────────────────────────────────────────────────────────
function relevanceRank(n) {
  const s = `${n.summary} ${n.raw}`.toUpperCase()
  const closed = /\b(CLSD|CLOSED)\b/.test(s)
  if (/\b(RWY|RUNWAY)\b/.test(s) && closed) return 0
  if (/\b(AD|AERODROME|ARP)\b/.test(s) && closed) return 0
  if (/\b(ILS|GP|GLIDE\s?PATH|LOC|LOCALI[SZ]ER|MLS|RNAV|VOR)\b/.test(s) &&
      /(U\/S|UNSERVICEABLE|OUT OF SER|OTS|NOT AVBL|UNAVBL)/.test(s)) return 1
  const catRank = { AERODROME: 2, AIRSPACE: 3, WARNING: 3, NAVAID: 4, OBSTACLE: 5, LIGHTING: 6, PROCEDURE: 6, OTHER: 7 }
  return catRank[n.category] ?? 7
}
function makeComparator(mode) {
  return (a, b) => {
    const ra = mode === 'category' ? CATEGORY_ORDER.indexOf(a.category) : relevanceRank(a)
    const rb = mode === 'category' ? CATEGORY_ORDER.indexOf(b.category) : relevanceRank(b)
    if (ra !== rb) return ra - rb
    return STATUS_RANK[a.validity.status] - STATUS_RANK[b.validity.status]
  }
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const monoInput = { fontFamily: T.mono, letterSpacing: '0.12em' }
const sel = {
  background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)',
  borderRadius: 4, color: 'var(--cp-txt)', fontFamily: T.mono,
  fontSize: 12, padding: '7px 10px', outline: 'none', cursor: 'pointer',
}
const upper = (v, n = 4) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, n)

function SectionHeader({ title }) {
  return (
    <div className="cp-section-header">
      <span className="cp-section-title">{title}</span>
      <div className="cp-divider" />
    </div>
  )
}

// ── NOTAM card (category-coloured) ────────────────────────────────────────────
function ValidityBadge({ status }) {
  const styles = {
    ACTIVE:  { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
    FUTURE:  { bg: 'rgba(234,179,8,0.12)',   color: '#eab308', border: 'rgba(234,179,8,0.3)' },
    EXPIRED: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280', border: 'rgba(107,114,128,0.3)' },
    UNKNOWN: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280', border: 'rgba(107,114,128,0.3)' },
  }
  const s = styles[status] ?? styles.UNKNOWN
  return (
    <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em',
      padding: '2px 7px', borderRadius: 3, background: s.bg, color: s.color,
      border: `1px solid ${s.border}`, flexShrink: 0 }}>{status}</span>
  )
}

function NotamCard({ notam }) {
  const [expanded, setExpanded] = useState(false)
  const cat = NOTAM_CATEGORIES[notam.category] ?? NOTAM_CATEGORIES.OTHER
  return (
    <div style={{ background: cat.bg, border: `1px solid ${cat.border}`,
      borderRadius: 6, padding: '10px 12px', borderLeft: `3px solid ${cat.color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: cat.color,
            letterSpacing: '0.1em', background: cat.bg, padding: '2px 6px',
            border: `1px solid ${cat.border}`, borderRadius: 3 }}>{cat.label.toUpperCase()}</span>
          <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: T.ink,
            letterSpacing: '0.08em' }}>{notam.id}</span>
        </div>
        <ValidityBadge status={notam.validity.status} />
      </div>
      <div style={{ fontFamily: T.sans, fontSize: 13, color: T.ink, marginBottom: 6, lineHeight: 1.5 }}>
        {notam.summary}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.08em', marginBottom: 6 }}>
        FROM {notam.startStr} · TO {notam.endStr}
      </div>
      <button onClick={() => setExpanded(v => !v)} style={{ background: 'none', border: 'none',
        cursor: 'pointer', fontFamily: T.mono, fontSize: 9, color: cat.color, letterSpacing: '0.1em', padding: 0 }}>
        {expanded ? '▲ HIDE RAW' : '▼ SHOW RAW'}
      </button>
      {expanded && (
        <div style={{ marginTop: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 4, padding: '8px 10px',
          fontFamily: T.mono, fontSize: 11, color: T.ink2, whiteSpace: 'pre-wrap',
          wordBreak: 'break-all', lineHeight: 1.6 }}>{notam.raw}</div>
      )}
    </div>
  )
}

// ── Role-coloured location section ────────────────────────────────────────────
function LocationSection({ target, all, shown, collapsed, onToggle }) {
  const r = ROLE_STYLE[target.role] ?? ROLE_STYLE.other
  const activeCount = all.filter(n => n.validity.status === 'ACTIVE').length
  return (
    <div id={`notam-sec-${target.icao}`} style={{ marginBottom: 8, scrollMarginTop: 12 }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        background: r.soft, border: `1px solid ${r.border}`, borderLeft: `3px solid ${r.color}`,
        borderRadius: 6, padding: '9px 12px', cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: r.color,
          letterSpacing: '0.08em' }}>{target.icao}</span>
        <span style={{ fontFamily: T.mono, fontSize: 8, color: r.color, opacity: 0.8,
          letterSpacing: '0.1em' }}>{target.label}</span>
        <span style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 8, fontWeight: 700,
          letterSpacing: '0.1em', padding: '2px 8px', borderRadius: 3,
          background: 'rgba(34,197,94,0.12)', color: T.green, border: '1px solid rgba(34,197,94,0.3)' }}>
          {activeCount} ACTIVE
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.dim }}>{collapsed ? '▶' : '▼'}</span>
      </button>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {all.length === 0
            ? <div style={{ fontFamily: T.sans, fontSize: 12, color: T.dim, padding: '4px 2px' }}>
                No NOTAMs available for this location.</div>
            : shown.length === 0
              ? <div style={{ fontFamily: T.sans, fontSize: 12, color: T.dim, padding: '4px 2px' }}>
                  No NOTAMs match the current filters.</div>
              : shown.map(n => <NotamCard key={n.id} notam={n} />)}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function NotamViewer() {
  const { sortMode, resetCount } = useCalculatorStore(s => ({
    sortMode: s.settings.notamSort || 'relevance',
    resetCount: s.resetCount,
  }))

  const [cache]        = useState(loadCache)
  // Inputs (mirror METAR/TAF)
  const [dep,          setDep]          = useState(cache?.dep          || '')
  const [arr,          setArr]          = useState(cache?.arr          || '')
  const [destAlts,     setDestAlts]     = useState(cache?.destAlts     || { alt1: '', alt2: '' })
  const [enrouteCount, setEnrouteCount] = useState(cache?.enrouteCount || 0)
  const [enrouteAlts,  setEnrouteAlts]  = useState(cache?.enrouteAlts  || Array(ERA_MAX).fill(''))
  const [extraChips,   setExtraChips]   = useState(cache?.extraChips   || [])
  const [customInput,  setCustomInput]  = useState('')
  const [detecting,    setDetecting]    = useState(false)

  // Results — restore from raw cache (re-parsed so validity status is fresh)
  const [view,         setView]         = useState('parsed')
  const [loading,      setLoading]      = useState(false)
  const [notams,       setNotams]       = useState(() => {
    if (cache?.rawPerIcao) return parseRawNotams(cache.rawPerIcao)
    if (cache?.notams)     return cache.notams   // backwards compat: old cache format
    return null
  })
  const [error,        setError]        = useState('')

  // Filters
  const [statusLevel, setStatusLevel] = useState('active')
  const [catFilter, setCatFilter] = useState(() => new Set(CATEGORY_ORDER))
  const [search, setSearch] = useState('')
  const [collapsedMap, setCollapsedMap] = useState({})

  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const prevReset = useRef(resetCount)
  useEffect(() => {
    if (resetCount === prevReset.current) return
    prevReset.current = resetCount
    setDep(''); setArr('')
    setDestAlts({ alt1: '', alt2: '' })
    setEnrouteCount(0)
    setEnrouteAlts(Array(ERA_MAX).fill(''))
    setExtraChips([])
    setNotams(null)
    setError('')
    setCollapsedMap({})
  }, [resetCount])

  // ── Ordered, deduped target list (role-tagged) ──
  const buildTargets = () => {
    const list = []
    const seen = new Set()
    const add = (icao, role, label) => {
      const u = (icao || '').trim().toUpperCase()
      if (u.length < 3 || seen.has(u)) return
      seen.add(u); list.push({ icao: u, role, label })
    }
    add(dep, 'dep', 'DEPARTURE')
    add(arr, 'arr', 'ARRIVAL')
    add(destAlts.alt1, 'destalt', 'DEST ALT 1')
    add(destAlts.alt2, 'destalt', 'DEST ALT 2')
    for (let i = 0; i < enrouteCount; i++) add(enrouteAlts[i], 'era', `ENROUTE ALT ${i + 1}`)
    for (const c of extraChips) {
      if (c.type === 'airport') add(c.icao, 'other', 'AIRPORT')
      else add(c.icao, 'fir', 'FIR')
    }
    return list
  }
  const targets = buildTargets()

  // ── Auto-detect FIRs: route great-circle + each airport's home FIR ──
  const handleDetect = () => {
    setDetecting(true)
    const airports = [dep, arr, destAlts.alt1, destAlts.alt2, ...enrouteAlts.slice(0, enrouteCount)]
      .map(x => (x || '').trim().toUpperCase()).filter(x => x.length >= 3)

    const found = []
    const seen = new Set(extraChips.map(c => c.icao))
    const pushFir = (fir) => {
      if (fir && !seen.has(fir.icao)) { seen.add(fir.icao); found.push({ icao: fir.icao, name: fir.name, type: 'fir' }) }
    }
    for (const ap of airports) pushFir(icaoToFir(ap))         // home FIRs
    const depC = getAirportCoords(dep), arrC = getAirportCoords(arr)
    if (depC && arrC) for (const fir of detectRouteFirs(depC, arrC)) pushFir(fir)  // route FIRs

    setExtraChips(prev => [...prev, ...found])
    setDetecting(false)
  }

  const addCustom = () => {
    const val = customInput.trim().toUpperCase()
    if (val.length < 3 || extraChips.find(c => c.icao === val)) { setCustomInput(''); return }
    setExtraChips(prev => [...prev, { icao: val, name: val, type: lookupAirport(val) ? 'airport' : 'fir' }])
    setCustomInput('')
  }
  const removeChip = (icao) => setExtraChips(c => c.filter(x => x.icao !== icao))

  const handleFetch = async () => {
    const t = buildTargets()
    if (!t.length) { setError('Enter at least one airport or FIR.'); return }
    setError(''); setLoading(true); setNotams(null); setCollapsedMap({})
    try {
      const { notams: result, rawPerIcao } = await fetchNotams(t.map(x => x.icao))
      setNotams(result)
      saveCache({ dep, arr, destAlts, enrouteCount, enrouteAlts, extraChips, rawPerIcao })
      haptic('medium')
    } catch (e) {
      setError(`Failed to fetch NOTAMs: ${e.message}`)
      haptic('heavy')
    } finally { setLoading(false) }
  }

  // Keep a stable ref to handleFetch so the back-online effect never captures a stale copy
  const handleFetchRef = useRef(handleFetch)
  useEffect(() => { handleFetchRef.current = handleFetch })

  // ── Back-online silent refresh ─────────────────────────────────────────
  // When device comes back online, re-fetch if there are existing results to refresh.
  const wasOnline = useRef(null)
  useEffect(() => {
    if (wasOnline.current === null) { wasOnline.current = isOnline; return }
    if (!wasOnline.current && isOnline && notams) {
      handleFetchRef.current()
    }
    wasOnline.current = isOnline
  }, [isOnline, notams])

  const toggleCat = (cat) => setCatFilter(prev => {
    const next = new Set(prev); next.has(cat) ? next.delete(cat) : next.add(cat); return next
  })

  const bySource = useMemo(() => {
    const m = {}
    for (const n of notams ?? []) (m[n.source] ??= []).push(n)
    return m
  }, [notams])

  const matches = (n) => {
    const st = n.validity.status
    if (statusLevel === 'active' && st !== 'ACTIVE') return false
    if (statusLevel === 'future' && !(st === 'ACTIVE' || st === 'FUTURE')) return false
    if (!catFilter.has(n.category)) return false
    if (search && !`${n.id} ${n.summary} ${n.raw} ${n.icao}`.toUpperCase().includes(search.toUpperCase())) return false
    return true
  }

  const comparator = makeComparator(sortMode)
  const sections = targets
    .map(target => ({ target, all: bySource[target.icao] ?? [] }))
    .map(s => ({ ...s, shown: s.all.filter(matches).sort(comparator) }))

  const totalShown = sections.reduce((sum, s) => sum + s.shown.length, 0)
  const hiddenExpired = statusLevel !== 'expired'
    ? (notams ?? []).filter(n => n.validity.status === 'EXPIRED').length : 0

  const isCollapsed = (icao) => collapsedMap[icao] ?? true   // default: collapsed
  const toggleSection = (icao) => setCollapsedMap(m => ({ ...m, [icao]: !isCollapsed(icao) }))
  const jumpTo = (icao) => {
    setCollapsedMap(m => ({ ...m, [icao]: false }))
    requestAnimationFrame(() =>
      document.getElementById(`notam-sec-${icao}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* ── ROUTE ── */}
      <SectionHeader title="Route" />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div className="cp-label" style={{ marginBottom: 4 }}>DEPARTURE</div>
          <input className="cp-input" style={monoInput} placeholder="e.g. WMKK" value={dep} maxLength={4}
            onChange={e => setDep(upper(e.target.value))}
            onKeyDown={e => e.key === 'Enter' && handleFetch()} />
        </div>
        <div style={{ color: 'var(--cp-acc)', fontSize: 20, paddingBottom: 9, flexShrink: 0, fontFamily: T.mono }}>✈</div>
        <div style={{ flex: 1 }}>
          <div className="cp-label" style={{ marginBottom: 4 }}>ARRIVAL</div>
          <input className="cp-input" style={monoInput} placeholder="e.g. RJBB" value={arr} maxLength={4}
            onChange={e => setArr(upper(e.target.value))}
            onKeyDown={e => e.key === 'Enter' && handleFetch()} />
        </div>
      </div>

      {/* ── DESTINATION ALTERNATES ── */}
      <SectionHeader title="Destination Alternates" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[{ key: 'alt1', label: 'DEST ALT 1' }, { key: 'alt2', label: 'DEST ALT 2' }].map(({ key, label }) => (
          <div key={key}>
            <div className="cp-label" style={{ marginBottom: 4 }}>{label}</div>
            <input className="cp-input" style={monoInput} placeholder="ICAO" value={destAlts[key]} maxLength={4}
              onChange={e => setDestAlts(p => ({ ...p, [key]: upper(e.target.value) }))}
              onKeyDown={e => e.key === 'Enter' && handleFetch()} />
          </div>
        ))}
      </div>

      {/* ── ENROUTE ALTERNATES ── */}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {Array.from({ length: enrouteCount }, (_, i) => (
            <div key={i}>
              <div className="cp-label" style={{ marginBottom: 4 }}>ERA {i + 1}</div>
              <input className="cp-input" style={monoInput} placeholder="ICAO" value={enrouteAlts[i] || ''} maxLength={4}
                onChange={e => setEnrouteAlts(p => { const n = [...p]; n[i] = upper(e.target.value); return n })}
                onKeyDown={e => e.key === 'Enter' && handleFetch()} />
            </div>
          ))}
        </div>
      ) : <div style={{ marginBottom: 20 }} />}

      {/* ── FIRs & MANUAL ── */}
      <SectionHeader title="FIRs & Manual Entries" />
      <button onClick={handleDetect} style={{
        width: '100%', marginBottom: 10,
        background: 'rgba(var(--cp-acc-rgb,63,224,197),0.06)',
        border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.25)',
        borderRadius: 6, padding: '9px', cursor: 'pointer',
        fontFamily: T.mono, fontSize: 9, letterSpacing: '0.14em', color: T.acc,
      }}>
        {detecting ? '⊙ DETECTING…' : '⊕ AUTO-DETECT FIRs (ROUTE + HOME FIRs)'}
      </button>

      {extraChips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {extraChips.map(c => {
            const r = c.type === 'airport' ? ROLE_STYLE.other : ROLE_STYLE.fir
            return (
              <div key={c.icao} style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                background: r.soft, border: `1px solid ${r.border}`, borderRadius: 20, padding: '4px 8px 4px 12px' }}>
                <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: r.color, letterSpacing: '0.08em' }}>{c.icao}</span>
                <span style={{ fontFamily: T.mono, fontSize: 8, color: r.color, opacity: 0.8 }}>{c.type === 'airport' ? 'ARPT' : 'FIR'}</span>
                <button onClick={() => removeChip(c.icao)} style={{ background: 'none', border: 'none',
                  cursor: 'pointer', color: T.dim, fontSize: 13, lineHeight: 1, padding: '0 2px' }}>×</button>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <input value={customInput} onChange={e => setCustomInput(upper(e.target.value, 6))}
          onKeyDown={e => e.key === 'Enter' && addCustom()} placeholder="Add specific airport or FIR…"
          autoComplete="off" autoCapitalize="characters" spellCheck="false"
          style={{ flex: 1, background: T.bg1, border: `1px solid ${T.bord2}`, borderRadius: 6,
            color: T.ink, fontFamily: T.mono, fontSize: 12, padding: '7px 10px', outline: 'none', letterSpacing: '0.08em' }} />
        <button onClick={addCustom} disabled={!customInput} style={{
          background: 'rgba(var(--cp-acc-rgb,63,224,197),0.1)', border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.3)',
          borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontFamily: T.mono, fontSize: 9,
          letterSpacing: '0.12em', color: T.acc, opacity: customInput ? 1 : 0.4 }}>+ ADD</button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ fontFamily: T.sans, fontSize: 12, color: T.orange, background: 'rgba(251,146,60,0.08)',
          border: '1px solid rgba(251,146,60,0.25)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>⚠ {error}</div>
      )}

      {/* ── Fetch ── */}
      <button onClick={handleFetch} disabled={loading || !targets.length} style={{
        width: '100%', padding: '12px', background: 'rgba(var(--cp-acc-rgb,63,224,197),0.12)',
        border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.35)', borderRadius: 6,
        cursor: targets.length ? 'pointer' : 'default', fontFamily: T.mono, fontSize: 10,
        letterSpacing: '0.16em', color: T.acc, marginBottom: 20, opacity: targets.length ? 1 : 0.5 }}>
        {loading ? '⊙ FETCHING NOTAMs…' : '⊕ FETCH NOTAMs'}
      </button>

      {/* ── Results ── */}
      {notams && (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{ display: 'inline-flex', background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)',
              borderRadius: 6, padding: 3, gap: 3 }}>
              {[['parsed', 'PARSED VIEW'], ['raw', 'RAW TEXT']].map(([id, label]) => (
                <button key={id} onClick={() => setView(id)} style={{
                  fontFamily: T.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                  padding: '6px 16px', borderRadius: 4,
                  border: `1px solid ${view === id ? 'var(--cp-acc)' : 'transparent'}`,
                  background: view === id ? 'var(--cp-accdim)' : 'transparent',
                  color: view === id ? T.acc : T.dim, cursor: 'pointer', transition: 'all 0.12s' }}>{label}</button>
              ))}
            </div>
          </div>

          {notams.length === 0 && (
            <div style={{ fontFamily: T.sans, fontSize: 13, color: T.dim, textAlign: 'center', padding: '24px 0' }}>
              No NOTAMs found for the selected locations.
            </div>
          )}

          {view === 'parsed' && notams.length > 0 && (
            <>
              {/* Summary chips (role-coloured) */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {sections.filter(s => s.all.length > 0).map(({ target, all }) => {
                  const r = ROLE_STYLE[target.role] ?? ROLE_STYLE.other
                  const active = all.filter(n => n.validity.status === 'ACTIVE').length
                  return (
                    <button key={target.icao} onClick={() => jumpTo(target.icao)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7, background: r.soft,
                      border: `1px solid ${r.border}`, borderRadius: 20, padding: '4px 10px', cursor: 'pointer' }}>
                      <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: r.color, letterSpacing: '0.06em' }}>{target.icao}</span>
                      <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: T.green }}>{active}</span>
                    </button>
                  )
                })}
              </div>

              {/* Status + search */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'inline-flex', background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)',
                  borderRadius: 6, padding: 3, gap: 3 }}>
                  {[['active', 'ACTIVE'], ['future', '+FUTURE'], ['expired', '+EXPIRED']].map(([id, label]) => (
                    <button key={id} onClick={() => setStatusLevel(id)} style={{
                      fontFamily: T.mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em',
                      padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                      border: `1px solid ${statusLevel === id ? 'var(--cp-acc)' : 'transparent'}`,
                      background: statusLevel === id ? 'var(--cp-accdim)' : 'transparent',
                      color: statusLevel === id ? T.acc : T.dim }}>{label}</button>
                  ))}
                </div>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                  style={{ flex: 1, minWidth: 120, background: T.bg1, border: `1px solid ${T.bord2}`, borderRadius: 6,
                    color: T.ink, fontFamily: T.mono, fontSize: 11, padding: '6px 10px', outline: 'none', letterSpacing: '0.06em' }} />
              </div>

              {/* Category chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
                {CATEGORY_ORDER.map(cat => {
                  const c = NOTAM_CATEGORIES[cat], on = catFilter.has(cat)
                  return (
                    <button key={cat} onClick={() => toggleCat(cat)} style={{
                      fontFamily: T.mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                      padding: '4px 9px', borderRadius: 12, cursor: 'pointer',
                      background: on ? c.bg : 'transparent', border: `1px solid ${on ? c.border : T.bord2}`,
                      color: on ? c.color : T.dim }}>{c.label.toUpperCase()}</button>
                  )
                })}
              </div>

              {/* ── Severity summary bar ── */}
              {(() => {
                const counts = {}
                for (const n of notams) counts[n.category] = (counts[n.category] || 0) + 1
                const cats = CATEGORY_ORDER.filter(cat => counts[cat])
                if (!cats.length) return null
                return (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
                    marginBottom: 14, padding: '9px 12px',
                    background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)',
                    borderRadius: 6,
                  }}>
                    <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '0.14em',
                      color: T.dim, marginRight: 2 }}>SUMMARY</span>
                    {cats.map(cat => {
                      const c = NOTAM_CATEGORIES[cat]
                      return (
                        <div key={cat} style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          background: c.bg, border: `1px solid ${c.border}`,
                          borderRadius: 4, padding: '3px 8px',
                        }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%',
                            background: c.color, flexShrink: 0 }} />
                          <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700,
                            color: c.color, letterSpacing: '0.06em' }}>{counts[cat]}</span>
                          <span style={{ fontFamily: T.mono, fontSize: 8, color: c.color,
                            letterSpacing: '0.06em', opacity: 0.85 }}>{c.label.toUpperCase()}</span>
                        </div>
                      )
                    })}
                    <span style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 8,
                      color: T.dim, letterSpacing: '0.1em' }}>{notams.length} TOTAL</span>
                  </div>
                )
              })()}

              {sections.map(({ target, all, shown }) => (
                <LocationSection key={target.icao} target={target} all={all} shown={shown}
                  collapsed={isCollapsed(target.icao)} onToggle={() => toggleSection(target.icao)} />
              ))}

              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.08em',
                textAlign: 'center', padding: '6px 0 0' }}>
                {totalShown} SHOWN{hiddenExpired > 0 && ` · ${hiddenExpired} EXPIRED HIDDEN`}{` · SORT: ${sortMode.toUpperCase()}`}
              </div>
            </>
          )}

          {view === 'raw' && notams.length > 0 && (
            <div style={{ background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)', borderRadius: 6, padding: '14px 16px' }}>
              <div style={{ fontFamily: T.mono, fontSize: 8, color: T.acc, letterSpacing: '0.18em', marginBottom: 12 }}>
                NOTAM BRIEFING — {new Date().toISOString().slice(0, 16).replace('T', ' ')}Z
              </div>
              {notams.map((n, i) => (
                <div key={n.id} style={{ borderBottom: i < notams.length - 1 ? `1px solid ${T.bord}` : 'none', paddingBottom: 12, marginBottom: 12 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: T.ink, letterSpacing: '0.08em', marginBottom: 4 }}>
                    {n.id} — {n.icao}{' '}
                    <span style={{ fontFamily: T.mono, fontSize: 8, color: n.validity.status === 'ACTIVE' ? '#22c55e' : n.validity.status === 'FUTURE' ? '#eab308' : T.dim }}>
                      [{n.validity.status}]</span>
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 11, color: T.ink2, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}>
                    {n.raw}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
