import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { TIMEZONES, searchZones } from '../data/worldTimezones'
import { lookupAirport } from '../data/airports'
import { WORLD_LAND_PATH, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT, projectLatLng } from '../data/worldMap'
import { nightRegionPath } from '../utils/terminator'

const CACHE_KEY = 'cb-worldtime-v2'
const MAX_ZONES = 10

const DEFAULT_ZONES = [
  { id: 'Dubai||Asia/Dubai',               label: 'Dubai',     country: 'AE', tz: 'Asia/Dubai',              icao: 'OMDB' },
  { id: 'Melbourne||Australia/Melbourne',  label: 'Melbourne', country: 'AU', tz: 'Australia/Melbourne',     icao: 'YMML' },
  { id: 'Tokyo||Asia/Tokyo',               label: 'Tokyo',     country: 'JP', tz: 'Asia/Tokyo',              icao: 'RJTT' },
  { id: 'Delhi||Asia/Kolkata',             label: 'Delhi',     country: 'IN', tz: 'Asia/Kolkata',            icao: 'VIDP' },
  { id: 'Riyadh||Asia/Riyadh',             label: 'Riyadh',    country: 'SA', tz: 'Asia/Riyadh',             icao: 'OERK' },
  { id: 'Karachi||Asia/Karachi',           label: 'Karachi',   country: 'PK', tz: 'Asia/Karachi',            icao: 'OPKC' },
  { id: 'London||Europe/London',           label: 'London',    country: 'GB', tz: 'Europe/London',           icao: 'EGLL' },
  { id: 'Auckland||Pacific/Auckland',      label: 'Auckland',  country: 'NZ', tz: 'Pacific/Auckland',        icao: 'NZAA' },
]

const T = {
  mono: 'var(--cb-font-mono)', sans: 'var(--cb-font-body)',
  acc: 'var(--cp-acc)', acc2: 'var(--cp-acc2)', dim: 'var(--cp-dim)', ink: 'var(--cp-txt)', ink2: 'var(--cp-muted)',
  bg1: 'var(--cp-bg3)', bord: 'var(--cp-border)', bord2: 'var(--cp-border2)',
  orange: 'var(--cp-orange, #fb923c)', green: '#22c55e', yellow: '#eab308',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadCache() {
  try { const r = localStorage.getItem(CACHE_KEY); return r ? JSON.parse(r) : null }
  catch { return null }
}
function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch {}
}

function getOffMin(tz, date) {
  try {
    const a = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
    const b = new Date(date.toLocaleString('en-US', { timeZone: tz }))
    return Math.round((b - a) / 60000)
  } catch { return 0 }
}

function fmtOffset(tz, date) {
  const off = getOffMin(tz, date)
  const abs = Math.abs(off)
  const h = String(Math.floor(abs / 60)).padStart(2, '0')
  const m = String(abs % 60).padStart(2, '0')
  return `${off >= 0 ? '+' : '-'}${h}:${m}`
}

function isCurrentlyDST(tz) {
  try {
    const y = new Date().getFullYear()
    const jan = getOffMin(tz, new Date(y, 0, 1))
    const jul = getOffMin(tz, new Date(y, 6, 1))
    if (jan === jul) return false
    return getOffMin(tz, new Date()) === Math.max(jan, jul)
  } catch { return false }
}

function getTimeStr(date, tz, fmt) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: fmt === '12hr',
    }).format(date)
  } catch { return '--:--:--' }
}

function getDateStr(date, tz) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
    }).format(date)
  } catch { return '' }
}

function getDayOff(date, tz) {
  try {
    const utc = date.toLocaleDateString('en-CA', { timeZone: 'UTC' })
    const loc = date.toLocaleDateString('en-CA', { timeZone: tz })
    const d = Math.round((new Date(loc) - new Date(utc)) / 86400000)
    return d === 0 ? null : d > 0 ? `+${d}D` : `${d}D`
  } catch { return null }
}

function getLocalLabel(tz) {
  const match = TIMEZONES.find(z => z.tz === tz)
  if (match) return match.label
  return tz.split('/').pop().replace(/_/g, ' ')
}

// City coordinates for the map — piggybacks on the airport each zone is
// already tagged with (icao), so no separate lat/lng dataset is needed.
function getZoneCoords(icao) {
  if (!icao) return null
  const a = lookupAirport(icao)
  return a ? { lat: a.lat, lng: a.lng } : null
}

// ── Pinned card (UTC / Local) ────────────────────────────────────────────────
function PinnedCard({ label, sublabel, timeStr, dateStr, offset, dst }) {
  return (
    <div className="cp-glass" style={{
      borderLeft: `3px solid var(--cp-acc)`, borderRadius: 6,
      padding: '14px 16px', flex: 1, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: T.mono, fontSize: 9, fontWeight: 700,
          color: T.acc, letterSpacing: '0.16em',
        }}>{label}</span>
        {sublabel && (
          <span style={{ fontFamily: T.mono, fontSize: 8, color: T.dim, letterSpacing: '0.08em' }}>
            {sublabel}
          </span>
        )}
        {dst && (
          <span style={{
            fontFamily: T.mono, fontSize: 8, letterSpacing: '0.08em', color: T.yellow,
            background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)',
            borderRadius: 3, padding: '1px 5px',
          }}>DST</span>
        )}
      </div>
      <div style={{
        fontFamily: T.mono, fontSize: 26, fontWeight: 700,
        color: T.acc, letterSpacing: '0.04em', lineHeight: 1, marginBottom: 5,
      }}>{timeStr}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.06em' }}>
          {dateStr}
        </span>
        {offset && (
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.06em' }}>
            UTC{offset}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Zone card ────────────────────────────────────────────────────────────────
function ZoneCard({ zone, now, fmt, dst, onRemove, flash }) {
  const offset  = fmtOffset(zone.tz, now)
  const timeStr = getTimeStr(now, zone.tz, fmt)
  const dateStr = getDateStr(now, zone.tz)
  const dayOff  = getDayOff(now, zone.tz)

  return (
    <div id={`wt-zone-${zone.id}`} className="cp-glass" style={{
      borderRadius: 6, transition: 'box-shadow 0.3s, border-color 0.3s',
      border: flash ? `1px solid ${T.acc2}` : '1px solid transparent',
      boxShadow: flash ? `0 0 0 3px color-mix(in srgb, ${T.acc2} 25%, transparent)` : 'none',
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.ink }}>
            {zone.label}
          </span>
          {zone.country && (
            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.1em' }}>
              {zone.country}
            </span>
          )}
          {dst && (
            <span style={{
              fontFamily: T.mono, fontSize: 8, letterSpacing: '0.08em', color: T.yellow,
              background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)',
              borderRadius: 3, padding: '1px 5px',
            }}>DST</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: T.mono, fontSize: 24, fontWeight: 700,
            color: T.acc, letterSpacing: '0.04em', lineHeight: 1,
          }}>{timeStr}</span>
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dim, letterSpacing: '0.08em' }}>
            UTC{offset}
          </span>
          {dayOff && (
            <span style={{
              fontFamily: T.mono, fontSize: 9, letterSpacing: '0.1em', color: T.orange,
              background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)',
              borderRadius: 3, padding: '1px 5px',
            }}>{dayOff}</span>
          )}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.08em', marginTop: 3 }}>
          {dateStr}
        </div>
      </div>
      <button onClick={onRemove} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: T.dim, fontSize: 18, padding: '10px 12px', flexShrink: 0, lineHeight: 1,
        minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>×</button>
    </div>
  )
}

// ── World map: coastline (reused from the Briefing route map) + a live
// day/night shading band + one pin per saved clock. Tap a pin to jump to
// its card below. ──
function WorldMap({ points, now, onSelect }) {
  // Terminator only needs to move once a minute, not every clock tick —
  // bucket `now` so the (cheap but non-trivial) path recompute is throttled.
  const minuteBucket = Math.floor(now.getTime() / 60000)
  const nightPath = useMemo(
    () => nightRegionPath(new Date(minuteBucket * 60000), projectLatLng, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT),
    [minuteBucket]
  )

  return (
    <div style={{
      position: 'relative', border: `1px solid ${T.bord}`, borderRadius: 10,
      overflow: 'hidden', marginBottom: 20, background: T.bg1,
    }}>
      <svg viewBox={`0 0 ${WORLD_MAP_WIDTH} ${WORLD_MAP_HEIGHT}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
        <rect x="0" y="0" width={WORLD_MAP_WIDTH} height={WORLD_MAP_HEIGHT} fill={T.bg1} />
        <path d={WORLD_LAND_PATH} fill={T.dim} fillOpacity={0.28} fillRule="evenodd" />
        <path d={nightPath} fill="#05070f" fillOpacity={0.42} />
        {points.map(p => {
          const pt = projectLatLng(p.lat, p.lng)
          const r = p.isLocal ? 6 : 4.5
          const color = p.isLocal ? T.acc : T.acc2
          const labelBelow = pt.y < 90
          return (
            <g key={p.id} onClick={() => onSelect(p.id)} style={{ cursor: 'pointer' }}>
              {p.isLocal && <circle cx={pt.x} cy={pt.y} r={r * 1.8} fill="none" stroke={color} strokeWidth={1} opacity={0.4} />}
              <circle cx={pt.x} cy={pt.y} r={r + 3} fill="transparent" />
              <circle cx={pt.x} cy={pt.y} r={r} fill={color} stroke={T.bg1} strokeWidth={1.5} />
              <text
                x={pt.x} y={labelBelow ? pt.y + 15 : pt.y - 9}
                textAnchor="middle" fontFamily={T.mono} fontSize={10}
                fontWeight={p.isLocal ? 700 : 500} fill={color}
                paintOrder="stroke" stroke={T.bg1} strokeWidth={3} strokeLinejoin="round"
              >{p.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function SectionHeader({ title }) {
  return (
    <div className="cp-section-header">
      <span className="cp-section-title">{title}</span>
      <div className="cp-divider" />
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function WorldTimeCalculator() {
  // Global clock format (set in Settings → Appearance)
  const fmt = useCalculatorStore(s => s.settings.clockFormat || '24hr')

  const [cache]   = useState(loadCache)
  const [zones,   setZones]   = useState(cache?.zones || DEFAULT_ZONES)
  const [search,  setSearch]  = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [now,     setNow]     = useState(() => new Date())
  const [flashId, setFlashId] = useState(null)
  const searchRef  = useRef(null)
  const flashTimer = useRef(null)

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Focus search on open
  useEffect(() => {
    if (showAdd) searchRef.current?.focus()
  }, [showAdd])

  // Local timezone (stable, detected once)
  const localTz    = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const localLabel = useMemo(() => getLocalLabel(localTz), [localTz])
  const localDst   = useMemo(() => isCurrentlyDST(localTz), [localTz])
  // Coordinates piggyback on the matching TIMEZONES entry's airport, if any
  // — Local has no fixed city, so this only resolves when localTz happens
  // to match a curated zone (the common case for pilots).
  const localIcao   = useMemo(() => TIMEZONES.find(z => z.tz === localTz)?.icao, [localTz])
  const localCoords = useMemo(() => getZoneCoords(localIcao), [localIcao])

  // Map pins: Local (if resolvable) + every saved zone that has coordinates
  const mapPoints = useMemo(() => {
    const points = []
    if (localCoords) points.push({ id: 'local', label: localLabel, isLocal: true, ...localCoords })
    for (const z of zones) {
      const coords = getZoneCoords(z.icao)
      if (coords) points.push({ id: z.id, label: z.label, isLocal: false, ...coords })
    }
    return points
  }, [localCoords, localLabel, zones])

  // Pin tap: jump to that clock's card and flash it briefly
  const selectMapPoint = (id) => {
    if (id === 'local') return
    document.getElementById(`wt-zone-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashId(id)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashId(null), 1400)
  }

  // DST precomputed per saved zone (changes twice/year — don't recompute every tick)
  const dstMap = useMemo(() => {
    const m = {}
    for (const z of zones) m[z.tz] = isCurrentlyDST(z.tz)
    return m
  }, [zones])

  // Search results (exclude already-added zones)
  const addedIds = useMemo(() => new Set(zones.map(z => z.id)), [zones])
  const results  = useMemo(() => {
    if (!search.trim()) return []
    return searchZones(search).filter(z => !addedIds.has(`${z.label}||${z.tz}`))
  }, [search, addedIds])

  const persist = (nextZones) =>
    saveCache({ zones: nextZones ?? zones })

  const addZone = (z) => {
    if (zones.length >= MAX_ZONES) return
    const zone = { id: `${z.label}||${z.tz}`, label: z.label, country: z.country || '', tz: z.tz, icao: z.icao || '' }
    const next = [...zones, zone]
    setZones(next); persist(next)
    setSearch(''); setShowAdd(false)
  }

  const removeZone = (id) => {
    const next = zones.filter(z => z.id !== id)
    setZones(next); persist(next)
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>

      {/* ── Pinned clocks: UTC + Local ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <PinnedCard
          label="UTC / ZULU"
          timeStr={getTimeStr(now, 'UTC', fmt)}
          dateStr={getDateStr(now, 'UTC')}
        />
        <PinnedCard
          label="LOCAL"
          sublabel={localLabel}
          timeStr={getTimeStr(now, localTz, fmt)}
          dateStr={getDateStr(now, localTz)}
          offset={fmtOffset(localTz, now)}
          dst={localDst}
        />
      </div>

      {/* ── World map: local + saved clocks, with a live day/night band ── */}
      {mapPoints.length > 0 && <WorldMap points={mapPoints} now={now} onSelect={selectMapPoint} />}

      {/* ── Saved clocks ── */}
      <SectionHeader title="Clocks" />

      {zones.length === 0 && (
        <div style={{
          fontFamily: T.sans, fontSize: 13, color: T.dim,
          textAlign: 'center', padding: '24px 0', lineHeight: 1.7,
        }}>
          No clocks added yet.<br />
          <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: '0.1em' }}>
            ADD A TIMEZONE BELOW TO GET STARTED
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {zones.map(zone => (
          <ZoneCard key={zone.id} zone={zone} now={now} fmt={fmt}
            dst={dstMap[zone.tz]} onRemove={() => removeZone(zone.id)} flash={flashId === zone.id} />
        ))}
      </div>

      {/* ── Add zone ── */}
      {zones.length < MAX_ZONES ? (
        showAdd ? (
          <div className="cp-card-bg3" style={{ border: `1px solid ${T.bord}`, borderRadius: 6, padding: 12 }}>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search City"
              autoComplete="off" spellCheck="false" autoCapitalize="none"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--cp-bginput)', border: `1px solid ${T.bord2}`,
                borderRadius: 4, color: T.ink, fontFamily: T.mono, fontSize: 12,
                padding: '8px 10px', outline: 'none', letterSpacing: '0.06em',
              }}
            />
            {results.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {results.map(z => (
                  <button
                    key={`${z.label}||${z.tz}`}
                    onClick={() => addZone(z)}
                    style={{
                      background: 'none', border: 'none', borderRadius: 4,
                      padding: '8px 10px', cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--cp-bg2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{ fontFamily: T.sans, fontSize: 13, color: T.ink, flex: 1 }}>{z.label}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.1em' }}>{z.country}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.06em' }}>UTC{fmtOffset(z.tz, now)}</span>
                  </button>
                ))}
              </div>
            )}
            {search.trim() && results.length === 0 && (
              <div style={{ fontFamily: T.sans, fontSize: 12, color: T.dim, padding: '8px 10px' }}>
                No results found.
              </div>
            )}
            <button onClick={() => { setShowAdd(false); setSearch('') }} style={{
              marginTop: 8, background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: T.mono, fontSize: 9, letterSpacing: '0.1em', color: T.dim, padding: '4px 0',
            }}>✕ CANCEL</button>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} style={{
            width: '100%', padding: '10px',
            background: 'rgba(var(--cp-acc-rgb,63,224,197),0.06)',
            border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.25)',
            borderRadius: 6, cursor: 'pointer',
            fontFamily: T.mono, fontSize: 9, letterSpacing: '0.14em', color: T.acc,
          }}>⊕ ADD TIMEZONE</button>
        )
      ) : (
        <div style={{
          fontFamily: T.mono, fontSize: 9, color: T.dim,
          letterSpacing: '0.1em', textAlign: 'center', padding: '8px 0',
        }}>MAX {MAX_ZONES} CLOCKS REACHED</div>
      )}
    </div>
  )
}
