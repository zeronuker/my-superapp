import React, { useState, useRef } from 'react'
import { fetchNotams, detectRouteFirs, buildInitialChips, NOTAM_CATEGORIES } from '../services/notamAPI'

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
  orange:  'var(--cp-orange, #fb923c)',
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—'
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z'
}

// ── Airport coordinate lookup (covers common airports) ─────────────────────────
const AIRPORT_COORDS = {
  WMKK: { lat: 2.7456,   lng: 101.7072 },
  WMKL: { lat: 6.1897,   lng: 100.1601 },
  WMKP: { lat: 5.2972,   lng: 100.2769 },
  WMKC: { lat: 6.1667,   lng: 102.2833 },
  WSSS: { lat: 1.3502,   lng: 103.9940 },
  OMDB: { lat: 25.2532,  lng: 55.3657  },
  OOMS: { lat: 23.5933,  lng: 58.2844  },
  RJBB: { lat: 34.4347,  lng: 135.2440 },
  RJTT: { lat: 35.5533,  lng: 139.7811 },
  RJAA: { lat: 35.7647,  lng: 140.3864 },
  RKSI: { lat: 37.4602,  lng: 126.4407 },
  EGLL: { lat: 51.4775,  lng: -0.4614  },
  EHAM: { lat: 52.3086,  lng: 4.7639   },
  EDDF: { lat: 50.0333,  lng: 8.5706   },
  LFPG: { lat: 49.0097,  lng: 2.5478   },
  LEMD: { lat: 40.4936,  lng: -3.5668  },
  LIRF: { lat: 41.8003,  lng: 12.2389  },
  LTFM: { lat: 41.2608,  lng: 28.7418  },
  VHHH: { lat: 22.3080,  lng: 113.9185 },
  VTBS: { lat: 13.6811,  lng: 100.7472 },
  VVTS: { lat: 10.8188,  lng: 106.6519 },
  VIDP: { lat: 28.5665,  lng: 77.1031  },
  VABB: { lat: 19.0896,  lng: 72.8656  },
  VECC: { lat: 22.6453,  lng: 88.4467  },
  OPKC: { lat: 24.9065,  lng: 67.1608  },
  HECC: { lat: 30.1219,  lng: 31.4056  },
  KATL: { lat: 33.6407,  lng: -84.4277 },
  KLAX: { lat: 33.9425,  lng: -118.408 },
  KJFK: { lat: 40.6413,  lng: -73.7781 },
  KORD: { lat: 41.9742,  lng: -87.9073 },
  KSFO: { lat: 37.6213,  lng: -122.379 },
  CYYZ: { lat: 43.6772,  lng: -79.6306 },
  CYVR: { lat: 49.1947,  lng: -123.184 },
  SBGR: { lat: -23.4356, lng: -46.4731 },
  SAEZ: { lat: -34.8222, lng: -58.5358 },
  YMML: { lat: -37.6690, lng: 144.841  },
  YSSY: { lat: -33.9461, lng: 151.177  },
  NZAA: { lat: -37.0082, lng: 174.792  },
  FAOR: { lat: -26.1392, lng: 28.246   },
  HKJK: { lat: -1.3192,  lng: 36.9275  },
}

function getAirportCoords(icao) {
  return AIRPORT_COORDS[icao?.toUpperCase()] ?? null
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
          {notam.icao && (
            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim,
              letterSpacing: '0.06em' }}>
              {notam.icao}
            </span>
          )}
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

function CategoryGroup({ category, notams }) {
  const [collapsed, setCollapsed] = useState(false)
  const cat = NOTAM_CATEGORIES[category] ?? NOTAM_CATEGORIES.OTHER
  const activeCount = notams.filter(n => n.validity.status === 'ACTIVE').length

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          width: '100%', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', padding: 0, marginBottom: 8,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
        <span style={{
          fontFamily: T.mono, fontSize: 8, fontWeight: 700,
          color: cat.color, letterSpacing: '0.16em',
          background: cat.bg, border: `1px solid ${cat.border}`,
          borderRadius: 3, padding: '3px 8px',
        }}>
          {cat.label.toUpperCase()}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim,
          letterSpacing: '0.08em' }}>
          {notams.length} NOTAM{notams.length !== 1 ? 'S' : ''}
          {activeCount > 0 && (
            <span style={{ color: '#22c55e', marginLeft: 6 }}>
              · {activeCount} ACTIVE
            </span>
          )}
        </span>
        <div style={{ flex: 1, height: 1, background: cat.border }} />
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dim }}>
          {collapsed ? '▶' : '▼'}
        </span>
      </button>

      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notams.map(n => <NotamCard key={n.id} notam={n} />)}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function NotamViewer() {
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

    // Always add airport chips + their home FIRs
    const initial = buildInitialChips(dep, arr)
    const newChips = [...initial]
    const seen = new Set(initial.map(c => c.icao))

    // En-route FIRs via great circle sampling (only if both coords known)
    if (depCoords && arrCoords) {
      const enroute = detectRouteFirs(depCoords, arrCoords)
      for (const fir of enroute) {
        if (!seen.has(fir.icao)) {
          seen.add(fir.icao)
          newChips.push({ icao: fir.icao, name: fir.name, type: 'fir' })
        }
      }
    }

    // Merge with existing manual chips
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

  // Group notams by category
  const grouped = React.useMemo(() => {
    if (!notams) return {}
    const g = {}
    for (const n of notams) {
      if (!g[n.category]) g[n.category] = []
      g[n.category].push(n)
    }
    return g
  }, [notams])

  const categoryOrder = ['AERODROME','AIRSPACE','NAVAID','OBSTACLE','WARNING','LIGHTING','PROCEDURE','OTHER']
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

        {/* Auto-detect button */}
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

      {/* ── View toggle ───────────────────────────────────────────────────── */}
      {fetched && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
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
      )}

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
          {/* Summary bar */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 14, flexWrap: 'wrap', gap: 6,
          }}>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim,
              letterSpacing: '0.1em' }}>
              {notams.length} NOTAM{notams.length !== 1 ? 'S' : ''} FOUND
              {' · '}
              {notams.filter(n => n.validity.status === 'ACTIVE').length} ACTIVE
            </span>
            <span style={{ fontFamily: T.mono, fontSize: 8, color: T.dim,
              letterSpacing: '0.08em' }}>
              {chips.map(c => c.icao).join(' · ')}
            </span>
          </div>

          {notams.length === 0 && (
            <div style={{ fontFamily: T.sans, fontSize: 13, color: T.dim,
              textAlign: 'center', padding: '24px 0' }}>
              No NOTAMs found for the selected locations.
            </div>
          )}

          {/* PARSED VIEW */}
          {view === 'parsed' && notams.length > 0 && (
            <div>
              {categoryOrder
                .filter(cat => grouped[cat]?.length)
                .map(cat => (
                  <CategoryGroup key={cat} category={cat} notams={grouped[cat]} />
                ))}
            </div>
          )}

          {/* RAW VIEW */}
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
