import { useState, useEffect, useRef } from "react"

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg0:    '#0a1020',
  bg1:    '#141a2e',
  bg2:    '#1b2340',
  bg3:    '#232c4d',
  mint:   '#3FE0C5',
  blue:   '#3B8DFF',
  violet: '#5B6BFF',
  ink:    '#e8ecf5',
  ink2:   '#b8c0d4',
  dim:    '#7c87a3',
  border: 'rgba(255,255,255,0.07)',
  bord2:  'rgba(255,255,255,0.12)',
  red:    '#f87171',
  green:  '#4ade80',
  orange: '#fb923c',
  mono:   "'JetBrains Mono', monospace",
  sans:   "'Inter', system-ui, sans-serif",
}

// ── Fake data ─────────────────────────────────────────────────────────────────
const PRAYERS = [
  { name: 'Fajr',    time: '05:52', done: true  },
  { name: 'Sunrise', time: '07:08', done: true,  isSunrise: true },
  { name: 'Dhuhr',   time: '13:06', done: true  },
  { name: 'Asr',     time: '16:29', done: false, isNext: true },
  { name: 'Maghrib', time: '19:21', done: false },
  { name: 'Isha',    time: '20:32', done: false },
]

const CITY_SUGGESTIONS = [
  { name: 'Kuala Lumpur', country: 'Malaysia',    lat: 3.139,  lng: 101.687 },
  { name: 'Petaling Jaya', country: 'Malaysia',   lat: 3.107,  lng: 101.607 },
  { name: 'Johor Bahru',  country: 'Malaysia',    lat: 1.492,  lng: 103.741 },
  { name: 'Kota Kinabalu',country: 'Malaysia',    lat: 5.980,  lng: 116.075 },
  { name: 'Dubai',        country: 'UAE',          lat: 25.204, lng: 55.270  },
  { name: 'Singapore',    country: 'Singapore',   lat: 1.352,  lng: 103.820 },
]

const METHODS = [
  'JAKIM (Malaysia)',
  'Moonsighting Committee',
  'Muslim World League',
  'ISNA (North America)',
  'Egyptian General Authority',
  'Umm Al-Qura (Makkah)',
]

// ── Shared primitives ─────────────────────────────────────────────────────────
function Label({ children, style }) {
  return (
    <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: T.dim, marginBottom: 6, ...style }}>
      {children}
    </div>
  )
}

function Card({ children, style }) {
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.border}`,
      borderRadius: 6, padding: '12px 16px', ...style }}>
      {children}
    </div>
  )
}

function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', border: `1px solid ${T.bord2}`, borderRadius: 4, overflow: 'hidden' }}>
      {options.map((o, i) => {
        const active = value === o.value
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            flex: 1, background: active ? 'rgba(63,224,197,0.15)' : 'transparent',
            border: 'none', borderRight: i < options.length - 1 ? `1px solid ${T.bord2}` : 'none',
            color: active ? T.mint : T.dim,
            fontFamily: T.mono, fontSize: 10, letterSpacing: '0.12em',
            padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{o.label}</button>
        )
      })}
    </div>
  )
}

function SectionHeader({ title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: '0.18em', color: T.mint, whiteSpace: 'nowrap' }}>
        {title}
      </span>
      <div style={{ flex: 1, height: 1, background: T.bord2 }} />
    </div>
  )
}

// ── Sub-nav (TIMES + QIBLAT only) ────────────────────────────────────────────
function SubNav({ active, onChange }) {
  const tabs = [
    { id: 'times',   label: 'TIMES',  icon: '◷' },
    { id: 'qiblat', label: 'QIBLAT', icon: '🧭' },
  ]
  return (
    <div style={{ display: 'flex', borderTop: `1px solid ${T.bord2}`, background: T.bg1, flexShrink: 0 }}>
      {tabs.map(t => {
        const on = active === t.id
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            flex: 1, background: 'transparent', border: 'none',
            borderTop: on ? `2px solid ${T.mint}` : '2px solid transparent',
            color: on ? T.mint : T.dim,
            fontFamily: T.mono, fontSize: 9, letterSpacing: '0.14em',
            padding: '10px 4px 8px', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Header with tappable location ─────────────────────────────────────────────
function Header({ location, onLocationChange }) {
  const [editing,  setEditing]  = useState(false)
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const inputRef = useRef(null)

  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hh = String(time.getHours()).padStart(2, '0')
  const mm = String(time.getMinutes()).padStart(2, '0')
  const ss = String(time.getSeconds()).padStart(2, '0')

  const handleQuery = (q) => {
    setQuery(q)
    if (q.length > 1) {
      setResults(CITY_SUGGESTIONS.filter(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        c.country.toLowerCase().includes(q.toLowerCase())
      ))
    } else {
      setResults([])
    }
  }

  const [gpsLoading, setGpsLoading] = useState(false)

  const selectCity = (city) => {
    onLocationChange(city)
    setEditing(false)
    setQuery('')
    setResults([])
  }

  const selectGps = () => {
    setEditing(false)
    setQuery('')
    setResults([])
    setGpsLoading(true)
    // Simulate GPS + reverse geocode (~1.5 s)
    setTimeout(() => {
      setGpsLoading(false)
      onLocationChange({ name: 'Petaling Jaya', country: 'Malaysia', lat: 3.107, lng: 101.607, source: 'gps' })
    }, 1500)
  }

  const startEdit = () => {
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${T.border}` }}>
      {/* Clock row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <span style={{ fontFamily: T.mono, fontSize: 36, fontWeight: 700, color: T.ink, letterSpacing: '0.04em', lineHeight: 1 }}>
          {hh}:{mm}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 15, color: T.dim }}>{ss}</span>
      </div>

      {/* Hijri + Gregorian */}
      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.mint, letterSpacing: '0.14em', marginBottom: 3 }}>
        28 REJAB 1446H
      </div>
      <div style={{ fontFamily: T.sans, fontSize: 12, color: T.ink2, marginBottom: 10 }}>
        Sunday, 25 May 2025
      </div>

      {/* Location — tappable */}
      {!editing ? (
        <button onClick={gpsLoading ? undefined : startEdit} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${gpsLoading ? 'rgba(63,224,197,0.35)' : T.bord2}`,
          borderRadius: 6, padding: '7px 12px',
          cursor: gpsLoading ? 'default' : 'pointer', width: '100%', textAlign: 'left',
        }}>
          <span style={{ fontSize: 12 }}>{gpsLoading ? '⊕' : '📍'}</span>
          <span style={{ fontFamily: T.sans, fontSize: 13, color: gpsLoading ? T.mint : T.ink, flex: 1 }}>
            {gpsLoading
              ? 'Locating…'
              : location.country
                ? `${location.name}, ${location.country}`
                : location.name}
          </span>
          {!gpsLoading && (
            location.source === 'gps'
              ? <span style={{ fontFamily: T.mono, fontSize: 8, color: T.mint, letterSpacing: '0.1em',
                  background: 'rgba(63,224,197,0.1)', border: `1px solid rgba(63,224,197,0.25)`,
                  borderRadius: 3, padding: '2px 5px' }}>GPS</span>
              : <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.1em' }}>
                  TAP TO CHANGE
                </span>
          )}
        </button>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => handleQuery(e.target.value)}
              placeholder="Search city…"
              style={{
                flex: 1, background: T.bg1,
                border: `1px solid ${T.mint}`,
                borderRadius: 6, color: T.ink,
                fontFamily: T.sans, fontSize: 13,
                padding: '8px 12px', outline: 'none',
              }}
            />
            <button onClick={() => { setEditing(false); setQuery(''); setResults([]) }} style={{
              background: 'transparent', border: `1px solid ${T.bord2}`,
              borderRadius: 6, color: T.dim,
              fontFamily: T.mono, fontSize: 9, letterSpacing: '0.1em',
              padding: '6px 10px', cursor: 'pointer',
            }}>✕</button>
          </div>

          {/* GPS option */}
          <button onClick={selectGps} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', background: 'rgba(63,224,197,0.06)',
            border: `1px solid rgba(63,224,197,0.2)`,
            borderRadius: 6, padding: '8px 12px', cursor: 'pointer',
            marginTop: 6,
          }}>
            <span style={{ fontSize: 13 }}>⊕</span>
            <span style={{ fontFamily: T.sans, fontSize: 12, color: T.mint }}>Use my current location (GPS)</span>
          </button>

          {/* Search results */}
          {results.length > 0 && (
            <div style={{
              background: T.bg2, border: `1px solid ${T.bord2}`,
              borderRadius: 6, marginTop: 4, overflow: 'hidden',
            }}>
              {results.map(city => (
                <button key={city.name} onClick={() => selectCity(city)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', background: 'transparent', border: 'none',
                  borderBottom: `1px solid ${T.border}`,
                  padding: '9px 12px', cursor: 'pointer', textAlign: 'left',
                }}>
                  <div>
                    <div style={{ fontFamily: T.sans, fontSize: 13, color: T.ink }}>{city.name}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.08em', marginTop: 2 }}>
                      {city.country} · {city.lat.toFixed(2)}°N {city.lng.toFixed(2)}°E
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: T.dim }}>→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Next Prayer Card ──────────────────────────────────────────────────────────
function NextPrayerCard() {
  const [secs, setSecs] = useState(11640)
  useEffect(() => {
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [])
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const f = n => String(n).padStart(2, '0')

  return (
    <div style={{
      margin: '12px 16px',
      background: 'linear-gradient(135deg, rgba(63,224,197,0.1) 0%, rgba(59,141,255,0.07) 100%)',
      border: `1px solid rgba(63,224,197,0.22)`, borderRadius: 8,
      padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '0.18em', color: T.mint, marginBottom: 4 }}>NEXT PRAYER</div>
        <div style={{ fontFamily: T.sans, fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 2 }}>Asr</div>
        <div style={{ fontFamily: T.mono, fontSize: 13, color: T.ink2 }}>16:29</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '0.14em', color: T.dim, marginBottom: 4 }}>IN</div>
        <div style={{ fontFamily: T.mono, fontSize: 26, fontWeight: 700, color: T.mint, lineHeight: 1 }}>{f(h)}:{f(m)}</div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dim, marginTop: 2 }}>{f(s)}s</div>
      </div>
    </div>
  )
}

// ── Prayer Row ────────────────────────────────────────────────────────────────
function PrayerRow({ name, time, done, isNext, isSunrise }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px',
      background: isNext ? 'rgba(63,224,197,0.05)' : 'transparent',
      borderLeft: isNext ? `3px solid ${T.mint}` : '3px solid transparent',
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isNext && <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.mint }} />}
        <span style={{
          fontFamily: T.sans, fontSize: 14,
          fontWeight: isNext ? 700 : 400,
          color: done ? T.dim : isNext ? T.mint : T.ink,
          opacity: isSunrise ? 0.55 : 1,
        }}>{name}</span>
        {isSunrise && <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.1em' }}>SUNRISE</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: done ? T.dim : isNext ? T.mint : T.ink2 }}>
          {time}
        </span>
        {done && <span style={{ fontSize: 10, color: T.dim }}>✓</span>}
      </div>
    </div>
  )
}

// ── Offline pill ──────────────────────────────────────────────────────────────
function OfflinePill() {
  return (
    <div style={{ margin: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'rgba(251,146,60,0.1)', border: `1px solid rgba(251,146,60,0.28)`,
      borderRadius: 20, padding: '3px 10px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.orange, display: 'inline-block' }} />
      <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '0.12em', color: T.orange }}>CALCULATED OFFLINE</span>
    </div>
  )
}

// ── Prayer Times Page ─────────────────────────────────────────────────────────
function PrayerTimesPage({ location, onLocationChange }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <Header location={location} onLocationChange={onLocationChange} />
      <NextPrayerCard />
      <OfflinePill />
      {PRAYERS.map(p => <PrayerRow key={p.name} {...p} />)}
      <div style={{ padding: '10px 16px', textAlign: 'center' }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.1em' }}>
          JAKIM (MALAYSIA) · SHAFI·I · LOCAL CALCULATION
        </span>
      </div>
    </div>
  )
}

// ── Compass ───────────────────────────────────────────────────────────────────
function CompassDial({ bearing = 292, live = true }) {
  const size = 220
  const cx = size / 2, cy = size / 2
  const R = size / 2 - 12

  const cardinals = [
    { label: 'U', angle: 0 },   // Utara = North (Malay)
    { label: 'T', angle: 90 },  // Timur = East
    { label: 'S', angle: 180 }, // Selatan = South
    { label: 'B', angle: 270 }, // Barat = West
  ]

  const ticks = Array.from({ length: 72 }, (_, i) => i * 5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={R} fill={T.bg2} stroke={T.bord2} strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={R - 20} fill="none" stroke={T.border} strokeWidth={1} />

        {ticks.map(deg => {
          const len = deg % 90 === 0 ? 10 : deg % 45 === 0 ? 7 : 4
          const a = (deg * Math.PI) / 180
          const x1 = cx + (R - 2) * Math.sin(a), y1 = cy - (R - 2) * Math.cos(a)
          const x2 = cx + (R - 2 - len) * Math.sin(a), y2 = cy - (R - 2 - len) * Math.cos(a)
          return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={deg % 90 === 0 ? T.ink2 : T.border2} strokeWidth={deg % 90 === 0 ? 1.5 : 1} />
        })}

        {cardinals.map(({ label, angle }) => {
          const a = (angle * Math.PI) / 180
          const lx = cx + (R - 30) * Math.sin(a), ly = cy - (R - 30) * Math.cos(a)
          return (
            <text key={label} x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
              fontFamily={T.mono} fontSize={label === 'U' ? 13 : 11} fontWeight="700"
              fill={label === 'U' ? T.mint : T.ink2}>{label}</text>
          )
        })}

        {/* Qibla needle */}
        <g transform={`rotate(${bearing}, ${cx}, ${cy})`}>
          <polygon points={`${cx},${cy - R + 35} ${cx - 7},${cy + 12} ${cx + 7},${cy + 12}`} fill={T.mint} opacity={0.9} />
          <polygon points={`${cx},${cy + R - 35} ${cx - 7},${cy - 12} ${cx + 7},${cy - 12}`} fill={T.dim} opacity={0.4} />
        </g>
        <circle cx={cx} cy={cy} r={5} fill={T.bg3} stroke={T.mint} strokeWidth={1.5} />

        {/* Kaaba emoji at needle tip */}
        <text x={cx} y={cy - R + 22} textAnchor="middle" dominantBaseline="central" fontSize={14}
          transform={`rotate(${bearing}, ${cx}, ${cy})`}>🕋</text>
      </svg>

      {/* Bearing readout */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: T.mono, fontSize: 30, fontWeight: 700, color: T.ink, letterSpacing: '0.04em' }}>
          {bearing}°
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 11, color: T.dim, letterSpacing: '0.12em', marginTop: 2 }}>
          WNW · TOWARD MECCA
        </div>
      </div>

      {/* Status */}
      {live ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.green, display: 'inline-block' }} />
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.green, letterSpacing: '0.12em' }}>LIVE COMPASS ACTIVE</span>
        </div>
      ) : (
        <div style={{ background: 'rgba(251,146,60,0.1)', border: `1px solid rgba(251,146,60,0.25)`,
          borderRadius: 6, padding: '8px 14px', textAlign: 'center', maxWidth: 240 }}>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.orange, letterSpacing: '0.12em', marginBottom: 4 }}>
            LIVE COMPASS UNAVAILABLE
          </div>
          <div style={{ fontFamily: T.sans, fontSize: 11, color: T.dim, lineHeight: 1.5 }}>
            Face <strong style={{ color: T.ink }}>292° (WNW)</strong> to face the Qiblat
          </div>
        </div>
      )}
    </div>
  )
}

// ── Qiblat Page ───────────────────────────────────────────────────────────────
function QiblatPage() {
  const [compassMode, setCompassMode] = useState('live')

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
      <SectionHeader title="QIBLAT" />
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
        <Seg
          options={[{ value: 'live', label: 'LIVE COMPASS' }, { value: 'static', label: 'STATIC (FALLBACK)' }]}
          value={compassMode} onChange={setCompassMode}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <CompassDial bearing={292} live={compassMode === 'live'} />
      </div>
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.08em' }}>
          TAP COMPASS TO ENABLE ON iOS 13+
        </span>
      </div>
    </div>
  )
}

// ── App Settings Panel (shows QIBLAT & SOLAT section) ────────────────────────
function AppSettingsPanel() {
  const [method,  setMethod]  = useState('JAKIM (Malaysia)')
  const [madhab,  setMadhab]  = useState('shafi')
  const [timeFmt, setTimeFmt] = useState('24hr')
  const [font,    setFont]    = useState('normal')
  const [autoRef, setAutoRef] = useState(true)

  const inp = {
    background: T.bg1, border: `1px solid ${T.bord2}`,
    borderRadius: 4, color: T.ink,
    fontFamily: T.mono, fontSize: 12,
    padding: '8px 10px', outline: 'none', width: '100%',
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

      {/* Existing app settings (greyed out — for context only) */}
      <div style={{ opacity: 0.35, pointerEvents: 'none', marginBottom: 20 }}>
        <SectionHeader title="INTERFACE" />
        <div style={{ marginBottom: 14 }}>
          <Label>Font Scale</Label>
          <Seg options={[{ value: 'compact', label: 'COMPACT' }, { value: 'normal', label: 'NORMAL' }, { value: 'large', label: 'LARGE' }]}
            value={font} onChange={setFont} />
        </div>
        <div style={{ height: 1, background: T.border, margin: '16px 0' }} />
        <SectionHeader title="METAR / TAF" />
        <div style={{ marginBottom: 14 }}>
          <Label>Auto Refresh</Label>
          <Seg options={[{ value: true, label: 'ON' }, { value: false, label: 'OFF' }]}
            value={autoRef} onChange={setAutoRef} />
        </div>
        <div style={{ height: 1, background: T.border, margin: '16px 0' }} />
      </div>

      {/* QIBLAT & SOLAT settings — active */}
      <SectionHeader title="QIBLAT & SOLAT" />

      <div style={{ marginBottom: 16 }}>
        <Label>Calculation Method</Label>
        <select value={method} onChange={e => setMethod(e.target.value)}
          style={{ ...inp, WebkitAppearance: 'none', appearance: 'none', cursor: 'pointer' }}>
          {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Label>Madhab (Asr calculation)</Label>
        <Seg
          options={[{ value: 'shafi', label: "SHAFI·I" }, { value: 'hanafi', label: 'HANAFI' }]}
          value={madhab} onChange={setMadhab}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Label>Time Format</Label>
        <Seg
          options={[{ value: '24hr', label: '24 HR' }, { value: '12hr', label: '12 HR' }]}
          value={timeFmt} onChange={setTimeFmt}
        />
      </div>

      <div style={{ marginTop: 8, padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.08em', lineHeight: 1.9 }}>
          ONLINE: ALADHAN API · OFFLINE: ADHAN.JS<br />
          PRAYER DATA CACHED FOR 7 DAYS
        </div>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function QiblatMockup() {
  const [page,     setPage]     = useState('times')
  const [view,     setView]     = useState('prayer')  // 'prayer' | 'settings'
  const [location, setLocation] = useState({ name: 'Kuala Lumpur', country: 'Malaysia', lat: 3.139, lng: 101.687, source: 'manual' })

  useEffect(() => {
    if (!document.getElementById('mockup-fonts')) {
      const link = document.createElement('link')
      link.id = 'mockup-fonts'
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap'
      document.head.appendChild(link)
    }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: T.bg0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', fontFamily: T.sans, padding: '40px 20px', gap: 20 }}>

      {/* View switcher */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { id: 'prayer',   label: '🕌  QIBLAT & SOLAT TAB' },
          { id: 'settings', label: '⚙  APP SETTINGS PANEL' },
        ].map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            background: view === v.id ? 'rgba(63,224,197,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${view === v.id ? 'rgba(63,224,197,0.5)' : T.border}`,
            borderRadius: 8, color: view === v.id ? T.mint : T.dim,
            fontFamily: T.mono, fontSize: 10, letterSpacing: '0.12em',
            padding: '8px 16px', cursor: 'pointer',
          }}>{v.label}</button>
        ))}
      </div>

      {/* Phone frame */}
      <div style={{ width: 375, background: T.bg1, border: `1px solid ${T.bord2}`,
        borderRadius: 16, boxShadow: '0 40px 120px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', height: 680 }}>

        {/* Parent app tab bar */}
        <div style={{ background: T.bg0, borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 6 }}>
          {['🔢','⏱','💱','🌦','📐','✈','⊙','🕌'].map((icon, i) => (
            <div key={i} style={{
              fontFamily: T.mono, fontSize: i === 7 ? 14 : 13,
              opacity: i === 7 ? 1 : 0.28,
              color: i === 7 ? T.mint : T.ink,
              padding: '4px 5px',
              borderBottom: i === 7 ? `2px solid ${T.mint}` : '2px solid transparent',
            }}>{icon}</div>
          ))}
          {/* Settings gear on far right */}
          <div style={{ marginLeft: 'auto', fontSize: 14, opacity: view === 'settings' ? 1 : 0.28,
            color: view === 'settings' ? T.mint : T.ink }}>⚙</div>
        </div>

        {/* Module title bar */}
        <div style={{ padding: '7px 16px', background: T.bg1, borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.mint, letterSpacing: '0.18em' }}>
            {view === 'settings' ? 'SETTINGS' : 'QIBLAT & SOLAT'}
          </span>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {view === 'settings' ? (
            <AppSettingsPanel />
          ) : (
            <>
              {page === 'times'  && <PrayerTimesPage location={location} onLocationChange={setLocation} />}
              {page === 'qiblat' && <QiblatPage />}
            </>
          )}
        </div>

        {/* Sub-nav (prayer tab only) */}
        {view === 'prayer' && <SubNav active={page} onChange={setPage} />}
      </div>

      {/* Hint */}
      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.12em',
        background: T.bg1, border: `1px solid ${T.border}`,
        padding: '6px 14px', borderRadius: 20 }}>
        TOGGLE VIEWS ABOVE · TAP LOCATION NAME TO SEARCH · TOGGLE COMPASS MODES IN QIBLAT
      </div>
    </div>
  )
}
