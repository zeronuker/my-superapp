import React, { useState, useMemo } from 'react'
import { fetchNotams, detectRouteFirs, buildInitialChips, NOTAM_CATEGORIES } from '../services/notamAPI'
import { useCalculatorStore } from '../store/calculatorStore'
import { lookupAirport } from '../data/airports'

// ── Tokens (matches app style) ────────────────────────────────────────────────
const T = {
  mono:    'var(--cb-font-mono)',
  sans:    'var(--cb-font-body)',
  acc:     'var(--cp-acc)',
  dim:     'var(--cp-dim)',
  ink:     'var(--cp-txt)',
  ink2:    'var(--cp-muted)',
  bg1:     'var(--cp-bg3)',
  bg2:     'var(--cp-bg2)',
  bord:    'var(--cp-border)',
  bord2:   'var(--cp-border2)',
  green:   '#22c55e',
  orange:  'var(--cp-orange, #fb923c)',
}

const CATEGORY_ORDER = ['AERODROME', 'AIRSPACE', 'NAVAID', 'OBSTACLE', 'WARNING', 'LIGHTING', 'PROCEDURE', 'OTHER']
const STATUS_RANK = { ACTIVE: 0, FUTURE: 1, EXPIRED: 2, UNKNOWN: 3 }

// Airport coordinate lookup — shared database (src/data/airports.js)
function getAirportCoords(icao) {
  const a = lookupAirport(icao)
  return a ? { lat: a.lat, lng: a.lng } : null
}

// ── Sort helpers ──────────────────────────────────────────────────────────────
// Lower rank = floats to the top.
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

function roleOf(chip) {
  if (chip.type === 'fir') return 'Enroute FIR'
  if (chip.type === 'airport') {
    if (/depart/i.test(chip.name)) return 'Departure'
    if (/arriv/i.test(chip.name))  return 'Arrival'
    return 'Airport'
  }
  return 'Location'
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function IcaoInput({ value, onChange, placeholder, label }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: T.mono, fontSize: 8, color: T.dim,
        letterSpacing: '0.14em', marginBottom: 5 }}>{label}</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
        placeholder={placeholder}
        maxLength={4}
        autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck="false"
        style={{
          width: '100%', background: T.bg1,
          border: `1px solid ${T.bord2}`,
          borderRadius: 6, color: T.ink,
          fontFamily: T.mono, fontSize: 16, fontWeight: 700,
          padding: '9px 12px', outline: 'none',
          letterSpacing: '0.12em', textTransform: 'uppercase',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

function Chip({ label, sublabel, type, onRemove }) {
  const isAirport = type === 'airport'
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: isAirport
        ? 'rgba(var(--cp-acc-rgb,63,224,197),0.08)'
        : 'rgba(107,114,128,0.1)',
      border: `1px solid ${isAirport
        ? 'rgba(var(--cp-acc-rgb,63,224,197),0.3)'
        : 'rgba(107,114,128,0.3)'}`,
      borderRadius: 20, padding: '4px 10px 4px 12px',
      flexShrink: 0,
    }}>
      <div>
        <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700,
          color: isAirport ? T.acc : T.ink2, letterSpacing: '0.08em' }}>
          {label}
        </span>
        {sublabel && (
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim,
            marginLeft: 5, letterSpacing: '0.06em' }}>
            {sublabel}
          </span>
        )}
      </div>
      <button onClick={onRemove} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: T.dim, fontSize: 13, lineHeight: 1, padding: '0 2px',
        display: 'flex', alignItems: 'center',
      }}>×</button>
    </div>
  )
}

function ValidityBadge({ status }) {
  const styles = {
    ACTIVE:  { bg: 'rgba(34,197,94,0.12)',    color: '#22c55e', border: 'rgba(34,197,94,0.3)'    },
    FUTURE:  { bg: 'rgba(234,179,8,0.12)',    color: '#eab308', border: 'rgba(234,179,8,0.3)'    },
    EXPIRED: { bg: 'rgba(107,114,128,0.12)',  color: '#6b7280', border: 'rgba(107,114,128,0.3)'  },
    UNKNOWN: { bg: 'rgba(107,114,128,0.12)',  color: '#6b7280', border: 'rgba(107,114,128,0.3)'  },
  }
  const s = styles[status] ?? styles.UNKNOWN
  return (
    <span style={{
      fontFamily: T.mono, fontSize: 8, fontWeight: 700,
      letterSpacing: '0.12em', padding: '2px 7px', borderRadius: 3,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      flexShrink: 0,
    }}>{status}</span>
  )
}

function NotamCard({ notam }) {
  const [expanded, setExpanded] = useState(false)
  const cat = NOTAM_CATEGORIES[notam.category] ?? NOTAM_CATEGORIES.OTHER

  return (
    <div style={{
      background: cat.bg,
      border: `1px solid ${cat.border}`,
      borderRadius: 6, padding: '10px 12px',
      borderLeft: `3px solid ${cat.color}`,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700,
            color: cat.color, letterSpacing: '0.1em',
            background: `${cat.bg}`, padding: '2px 6px',
            border: `1px solid ${cat.border}`, borderRadius: 3 }}>
            {cat.label.toUpperCase()}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700,
            color: T.ink, letterSpacing: '0.08em' }}>
            {notam.id}
          </span>
        </div>
        <ValidityBadge status={notam.validity.status} />
      </div>

      {/* Summary */}
      <div style={{ fontFamily: T.sans, fontSize: 13, color: T.ink,
        marginBottom: 6, lineHeight: 1.5 }}>
        {notam.summary}
      </div>

      {/* Validity times */}
      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim,
        letterSpacing: '0.08em', marginBottom: 6 }}>
        FROM {notam.startStr} · TO {notam.endStr}
      </div>

      {/* Raw toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: T.mono, fontSize: 9, color: cat.color,
          letterSpacing: '0.1em', padding: 0,
        }}>
        {expanded ? '▲ HIDE RAW' : '▼ SHOW RAW'}
      </button>

      {expanded && (
        <div style={{
          marginTop: 8, background: 'rgba(0,0,0,0.2)',
          borderRadius: 4, padding: '8px 10px',
          fontFamily: T.mono, fontSize: 11, color: T.ink2,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
        }}>
          {notam.raw}
        </div>
      )}
    </div>
  )
}

// Collapsible per-location section
function LocationSection({ chip, all, shown, collapsed, onToggle }) {
  const role        = roleOf(chip)
  const activeCount = all.filter(n => n.validity.status === 'ACTIVE').length

  return (
    <div id={`notam-sec-${chip.icao}`} style={{ marginBottom: 10, scrollMarginTop: 12 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--cp-bg3)', border: `1px solid ${T.bord}`,
          borderRadius: 6, padding: '9px 12px', cursor: 'pointer', textAlign: 'left',
        }}>
        <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700,
          color: T.ink, letterSpacing: '0.08em' }}>{chip.icao}</span>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim,
          letterSpacing: '0.1em' }}>{role.toUpperCase()}</span>
        <span style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 8, fontWeight: 700,
          letterSpacing: '0.1em', padding: '2px 8px', borderRadius: 3,
          background: 'rgba(34,197,94,0.12)', color: T.green,
          border: '1px solid rgba(34,197,94,0.3)' }}>
          {activeCount} ACTIVE
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.dim }}>
          {collapsed ? '▶' : '▼'}
        </span>
      </button>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {shown.length === 0 ? (
            <div style={{ fontFamily: T.sans, fontSize: 12, color: T.dim,
              padding: '4px 2px' }}>No NOTAMs match the current filters.</div>
          ) : shown.map(n => <NotamCard key={n.id} notam={n} />)}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function NotamViewer() {
  const sortMode = useCalculatorStore(s => s.settings.notamSort) || 'relevance'

  const [dep,    setDep]    = useState('')
  const [arr,    setArr]    = useState('')
  const [chips,  setChips]  = useState([])   // { icao, name, type }
  const [customInput, setCustomInput] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [view,   setView]   = useState('parsed')  // 'parsed' | 'raw'
  const [loading, setLoading] = useState(false)
  const [notams,  setNotams]  = useState(null)
  const [error,   setError]   = useState('')
  const [fetched, setFetched] = useState(false)

  // Filters
  const [statusLevel, setStatusLevel] = useState('active') // 'active' | 'future' | 'expired'
  const [catFilter,   setCatFilter]   = useState(() => new Set(CATEGORY_ORDER))
  const [search,      setSearch]      = useState('')
  const [collapsedMap, setCollapsedMap] = useState({})     // source → bool override

  const removeChip = (icao) => setChips(c => c.filter(x => x.icao !== icao))

  const addCustom = () => {
    const val = customInput.trim().toUpperCase()
    if (!val || chips.find(c => c.icao === val)) { setCustomInput(''); return }
    setChips(c => [...c, { icao: val, name: val, type: 'manual' }])
    setCustomInput('')
  }

  // Auto-detect FIRs from DEP/ARR
  const handleDetect = () => {
    setDetecting(true)
    const depCoords = getAirportCoords(dep)
    const arrCoords = getAirportCoords(arr)

    const initial = buildInitialChips(dep, arr)
    const newChips = [...initial]
    const seen = new Set(initial.map(c => c.icao))

    if (depCoords && arrCoords) {
      const enroute = detectRouteFirs(depCoords, arrCoords)
      for (const fir of enroute) {
        if (!seen.has(fir.icao)) {
          seen.add(fir.icao)
          newChips.push({ icao: fir.icao, name: fir.name, type: 'fir' })
        }
      }
    }

    setChips(prev => {
      const manual = prev.filter(c => c.type === 'manual' && !seen.has(c.icao))
      return [...newChips, ...manual]
    })
    setDetecting(false)
  }

  const handleFetch = async () => {
    if (!chips.length) { setError('Add at least one airport or FIR.'); return }
    setError('')
    setLoading(true)
    setNotams(null)
    setCollapsedMap({})
    try {
      const data = await fetchNotams(chips.map(c => c.icao))
      setNotams(data)
      setFetched(true)
    } catch (e) {
      setError(`Failed to fetch NOTAMs: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleCat = (cat) => setCatFilter(prev => {
    const next = new Set(prev)
    next.has(cat) ? next.delete(cat) : next.add(cat)
    return next
  })

  // Group all notams by source location
  const bySource = useMemo(() => {
    const m = {}
    for (const n of notams ?? []) { (m[n.source] ??= []).push(n) }
    return m
  }, [notams])

  // Apply status / category / search filters
  const matches = (n) => {
    const st = n.validity.status
    if (statusLevel === 'active' && st !== 'ACTIVE') return false
    if (statusLevel === 'future' && !(st === 'ACTIVE' || st === 'FUTURE')) return false
    if (!catFilter.has(n.category)) return false
    if (search) {
      const q = search.toUpperCase()
      if (!`${n.id} ${n.summary} ${n.raw} ${n.icao}`.toUpperCase().includes(q)) return false
    }
    return true
  }

  const comparator = makeComparator(sortMode)

  // Sections in chip order; only locations that returned NOTAMs
  const sections = chips
    .map(chip => ({ chip, all: bySource[chip.icao] ?? [] }))
    .filter(s => s.all.length > 0)
    .map(s => ({ ...s, shown: s.all.filter(matches).sort(comparator) }))

  const totalShown = sections.reduce((sum, s) => sum + s.shown.length, 0)
  const hiddenExpired = statusLevel !== 'expired'
    ? (notams ?? []).filter(n => n.validity.status === 'EXPIRED').length
    : 0

  const isCollapsed = (chip) => collapsedMap[chip.icao] ?? (chip.type === 'fir')
  const toggleSection = (icao) => setCollapsedMap(m => ({ ...m, [icao]: !(m[icao] ?? false) }))

  const jumpTo = (icao) => {
    setCollapsedMap(m => ({ ...m, [icao]: false }))
    requestAnimationFrame(() => {
      document.getElementById(`notam-sec-${icao}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const canDetect = dep.length >= 2 || arr.length >= 2

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Route inputs ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: T.mono, fontSize: 8, color: T.acc,
          letterSpacing: '0.18em', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          ROUTE (OPTIONAL)
          <div style={{ flex: 1, height: 1, background: 'rgba(var(--cp-acc-rgb,63,224,197),0.2)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8,
          alignItems: 'end', minWidth: 0 }}>
          <IcaoInput label="DEPARTURE" value={dep} onChange={setDep} placeholder="WMKK" />
          <span style={{ fontFamily: T.mono, fontSize: 18, color: T.dim,
            paddingBottom: 10, display: 'block' }}>→</span>
          <IcaoInput label="ARRIVAL" value={arr} onChange={setArr} placeholder="RJBB" />
        </div>

        <button
          onClick={handleDetect}
          disabled={!canDetect || detecting}
          style={{
            width: '100%', marginTop: 8,
            background: 'rgba(var(--cp-acc-rgb,63,224,197),0.06)',
            border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.25)',
            borderRadius: 6, padding: '8px', cursor: canDetect ? 'pointer' : 'default',
            fontFamily: T.mono, fontSize: 9, letterSpacing: '0.14em',
            color: canDetect ? T.acc : T.dim, opacity: canDetect ? 1 : 0.5,
          }}>
          {detecting ? '⊙ DETECTING…' : '⊕ AUTO-DETECT AIRPORTS & FIRs FROM ROUTE'}
        </button>
      </div>

      {/* ── Chip tray ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: T.mono, fontSize: 8, color: T.acc,
          letterSpacing: '0.18em', marginBottom: 8,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          SEARCH SCOPE
          <div style={{ flex: 1, height: 1, background: 'rgba(var(--cp-acc-rgb,63,224,197),0.2)' }} />
        </div>

        {chips.length === 0 && (
          <div style={{ fontFamily: T.sans, fontSize: 11, color: T.dim,
            lineHeight: 1.5, marginBottom: 8 }}>
            No airports or FIRs selected. Use auto-detect above or add manually below.
          </div>
        )}

        {chips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {chips.map(c => (
              <Chip
                key={c.icao}
                label={c.icao}
                sublabel={c.type === 'fir' ? 'FIR' : c.type === 'airport' ? 'ARPT' : ''}
                type={c.type === 'airport' ? 'airport' : 'fir'}
                onRemove={() => removeChip(c.icao)}
              />
            ))}
          </div>
        )}

        {/* Manual add */}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={customInput}
            onChange={e => setCustomInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && addCustom()}
            placeholder="Add ICAO or FIR…"
            autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck="false"
            style={{
              flex: 1, background: T.bg1, border: `1px solid ${T.bord2}`,
              borderRadius: 6, color: T.ink, fontFamily: T.mono,
              fontSize: 12, padding: '7px 10px', outline: 'none',
              letterSpacing: '0.08em',
            }}
          />
          <button
            onClick={addCustom}
            disabled={!customInput}
            style={{
              background: 'rgba(var(--cp-acc-rgb,63,224,197),0.1)',
              border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.3)',
              borderRadius: 6, padding: '7px 14px', cursor: 'pointer',
              fontFamily: T.mono, fontSize: 9, letterSpacing: '0.12em',
              color: T.acc, opacity: customInput ? 1 : 0.4,
            }}>
            + ADD
          </button>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          fontFamily: T.sans, fontSize: 12, color: T.orange,
          background: 'rgba(251,146,60,0.08)',
          border: '1px solid rgba(251,146,60,0.25)',
          borderRadius: 6, padding: '8px 12px', marginBottom: 12,
        }}>⚠ {error}</div>
      )}

      {/* ── Fetch button ──────────────────────────────────────────────────── */}
      <button
        onClick={handleFetch}
        disabled={loading || !chips.length}
        style={{
          width: '100%', padding: '12px',
          background: 'rgba(var(--cp-acc-rgb,63,224,197),0.12)',
          border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.35)',
          borderRadius: 6, cursor: chips.length ? 'pointer' : 'default',
          fontFamily: T.mono, fontSize: 10,
          letterSpacing: '0.16em', color: T.acc,
          marginBottom: 20,
          opacity: chips.length ? 1 : 0.5,
        }}>
        {loading ? '⊙ FETCHING NOTAMs…' : '⊕ FETCH NOTAMs'}
      </button>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {notams && (
        <>
          {/* View toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <div style={{
              display: 'inline-flex', background: 'var(--cp-bg3)',
              border: '1px solid var(--cp-border)', borderRadius: 6, padding: 3, gap: 3,
            }}>
              {[['parsed', 'PARSED VIEW'], ['raw', 'RAW TEXT']].map(([id, label]) => (
                <button key={id} onClick={() => setView(id)} style={{
                  fontFamily: T.mono, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.14em', padding: '6px 16px', borderRadius: 4,
                  border: `1px solid ${view === id ? 'var(--cp-acc)' : 'transparent'}`,
                  background: view === id ? 'var(--cp-accdim)' : 'transparent',
                  color: view === id ? T.acc : T.dim,
                  cursor: 'pointer', transition: 'all 0.12s',
                }}>{label}</button>
              ))}
            </div>
          </div>

          {notams.length === 0 && (
            <div style={{ fontFamily: T.sans, fontSize: 13, color: T.dim,
              textAlign: 'center', padding: '24px 0' }}>
              No NOTAMs found for the selected locations.
            </div>
          )}

          {/* ── PARSED VIEW ── */}
          {view === 'parsed' && notams.length > 0 && (
            <>
              {/* Location summary chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {sections.map(({ chip, all }) => {
                  const active = all.filter(n => n.validity.status === 'ACTIVE').length
                  return (
                    <button key={chip.icao} onClick={() => jumpTo(chip.icao)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      background: 'var(--cp-bg3)', border: `1px solid ${T.bord2}`,
                      borderRadius: 20, padding: '4px 10px', cursor: 'pointer',
                    }}>
                      <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700,
                        color: T.ink, letterSpacing: '0.06em' }}>{chip.icao}</span>
                      <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700,
                        color: T.green }}>{active}</span>
                    </button>
                  )
                })}
              </div>

              {/* Filter bar — status */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
                marginBottom: 10 }}>
                <div style={{ display: 'inline-flex', background: 'var(--cp-bg3)',
                  border: '1px solid var(--cp-border)', borderRadius: 6, padding: 3, gap: 3 }}>
                  {[['active', 'ACTIVE'], ['future', '+FUTURE'], ['expired', '+EXPIRED']].map(([id, label]) => (
                    <button key={id} onClick={() => setStatusLevel(id)} style={{
                      fontFamily: T.mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em',
                      padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                      border: `1px solid ${statusLevel === id ? 'var(--cp-acc)' : 'transparent'}`,
                      background: statusLevel === id ? 'var(--cp-accdim)' : 'transparent',
                      color: statusLevel === id ? T.acc : T.dim,
                    }}>{label}</button>
                  ))}
                </div>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search…"
                  style={{
                    flex: 1, minWidth: 120, background: T.bg1, border: `1px solid ${T.bord2}`,
                    borderRadius: 6, color: T.ink, fontFamily: T.mono,
                    fontSize: 11, padding: '6px 10px', outline: 'none', letterSpacing: '0.06em',
                  }}
                />
              </div>

              {/* Filter bar — categories */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
                {CATEGORY_ORDER.map(cat => {
                  const c  = NOTAM_CATEGORIES[cat]
                  const on = catFilter.has(cat)
                  return (
                    <button key={cat} onClick={() => toggleCat(cat)} style={{
                      fontFamily: T.mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                      padding: '4px 9px', borderRadius: 12, cursor: 'pointer',
                      background: on ? c.bg : 'transparent',
                      border: `1px solid ${on ? c.border : T.bord2}`,
                      color: on ? c.color : T.dim,
                    }}>{c.label.toUpperCase()}</button>
                  )
                })}
              </div>

              {/* Sections */}
              {sections.map(({ chip, all, shown }) => (
                <LocationSection
                  key={chip.icao}
                  chip={chip}
                  all={all}
                  shown={shown}
                  collapsed={isCollapsed(chip)}
                  onToggle={() => toggleSection(chip.icao)}
                />
              ))}

              {/* Footer note */}
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim,
                letterSpacing: '0.08em', textAlign: 'center', padding: '6px 0 0' }}>
                {totalShown} SHOWN
                {hiddenExpired > 0 && ` · ${hiddenExpired} EXPIRED HIDDEN`}
                {` · SORT: ${sortMode.toUpperCase()}`}
              </div>
            </>
          )}

          {/* ── RAW VIEW ── */}
          {view === 'raw' && notams.length > 0 && (
            <div style={{
              background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)',
              borderRadius: 6, padding: '14px 16px',
            }}>
              <div style={{ fontFamily: T.mono, fontSize: 8, color: T.acc,
                letterSpacing: '0.18em', marginBottom: 12 }}>
                NOTAM BRIEFING — {new Date().toISOString().slice(0, 16).replace('T', ' ')}Z
              </div>
              {notams.map((n, i) => (
                <div key={n.id} style={{
                  borderBottom: i < notams.length - 1 ? `1px solid ${T.bord}` : 'none',
                  paddingBottom: 12, marginBottom: 12,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                    color: T.ink, letterSpacing: '0.08em', marginBottom: 4 }}>
                    {n.id} — {n.icao}
                    {' '}
                    <span style={{ fontFamily: T.mono, fontSize: 8,
                      color: n.validity.status === 'ACTIVE' ? '#22c55e'
                           : n.validity.status === 'FUTURE' ? '#eab308' : T.dim }}>
                      [{n.validity.status}]
                    </span>
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 11, color: T.ink2,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}>
                    {n.raw}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
