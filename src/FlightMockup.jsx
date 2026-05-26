import { useState } from 'react'

const T = {
  bg0:    'var(--cp-bg)',
  bg1:    'var(--cp-bg2)',
  bg2:    'var(--cp-bg3)',
  ink:    'var(--cp-txt)',
  ink2:   'var(--cp-muted)',
  dim:    'var(--cp-dim)',
  border: 'var(--cp-border)',
  bord2:  'var(--cp-border2)',
  orange: '#fb923c',
  green:  '#4ade80',
  mono:   'var(--cb-font-mono)',
  sans:   'var(--cb-font-body)',
  acc:    'var(--cp-acc)',
}

// ── Fake prayer times for display ────────────────────────────────────────────
const FLIGHT_TIMES = [
  { name: 'Fajr',    time: '04:09', done: true,  isNext: false, isSunrise: false },
  { name: 'Sunrise', time: '05:47', done: true,  isNext: false, isSunrise: true  },
  { name: 'Dhuhr',   time: '12:11', done: false, isNext: true,  isSunrise: false },
  { name: 'Asr',     time: '15:38', done: false, isNext: false, isSunrise: false },
  { name: 'Maghrib', time: '18:29', done: false, isNext: false, isSunrise: false },
  { name: 'Isha',    time: '20:03', done: false, isNext: false, isSunrise: false },
]

// ── Sub-nav ───────────────────────────────────────────────────────────────────
function SubNav({ active, onChange }) {
  const tabs = [
    { id: 'solat',  label: 'SOLAT',  icon: '◷' },
    { id: 'qiblat', label: 'QIBLAT', icon: '🧭' },
    { id: 'flight', label: 'FLIGHT', icon: '✈️' },
  ]
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
      {tabs.map(t => {
        const on = active === t.id
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            background: 'transparent', border: 'none',
            borderBottom: on ? '2px solid var(--cp-acc)' : '2px solid transparent',
            color: on ? T.acc : T.dim,
            fontFamily: T.mono, fontSize: 10, letterSpacing: '0.14em',
            padding: '8px 14px 10px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            marginBottom: -1,
          }}>
            <span style={{ fontSize: 13 }}>{t.icon}</span>
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Input field ───────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, unit, type = 'text', hint }) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: 8, color: T.dim,
        letterSpacing: '0.14em', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1, background: T.bg2,
            border: `1px solid ${T.bord2}`,
            borderRadius: 6, color: T.ink,
            fontFamily: T.mono, fontSize: 13,
            padding: '8px 12px', outline: 'none',
            letterSpacing: '0.05em',
          }}
        />
        {unit && (
          <span style={{ fontFamily: T.mono, fontSize: 10,
            color: T.dim, letterSpacing: '0.1em', flexShrink: 0 }}>{unit}</span>
        )}
      </div>
      {hint && (
        <div style={{ fontFamily: T.sans, fontSize: 10, color: T.dim,
          marginTop: 4, lineHeight: 1.4 }}>{hint}</div>
      )}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: T.mono, fontSize: 8, color: T.acc,
        letterSpacing: '0.18em', marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 8 }}>
        {title}
        <div style={{ flex: 1, height: 1, background: `rgba(var(--cp-acc-rgb,63,224,197),0.2)` }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

// ── Prayer time row ───────────────────────────────────────────────────────────
function PrayerRow({ name, time, done, isNext, isSunrise }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 12px',
      background: isNext ? 'rgba(var(--cp-acc-rgb,63,224,197),0.07)' : 'transparent',
      border: `1px solid ${isNext ? 'rgba(var(--cp-acc-rgb,63,224,197),0.25)' : T.border}`,
      borderRadius: 6,
      opacity: isSunrise ? 0.55 : done ? 0.4 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isNext && <span style={{ width: 6, height: 6, borderRadius: '50%',
          background: T.acc, display: 'inline-block' }} />}
        <span style={{
          fontFamily: T.sans, fontSize: 13,
          color: isNext ? T.acc : T.ink,
          marginLeft: isNext ? 0 : 14,
        }}>{name}</span>
        {isSunrise && (
          <span style={{ fontFamily: T.mono, fontSize: 7, color: T.dim,
            letterSpacing: '0.1em' }}>SUNRISE</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: T.mono, fontSize: 13,
          color: isNext ? T.acc : T.ink2 }}>{time}</span>
        {done && <span style={{ fontSize: 11 }}>✓</span>}
      </div>
    </div>
  )
}

// ── Flight mode tab ───────────────────────────────────────────────────────────
function FlightTab() {
  const [dep,      setDep]      = useState('WMKK')
  const [dest,     setDest]     = useState('OMDB')
  const [elapsed,  setElapsed]  = useState('3')
  const [altitude, setAltitude] = useState('35000')
  const [heading,  setHeading]  = useState('315')
  const [computed, setComputed] = useState(true) // mockup: show results by default

  // Mock estimated position based on KL→Dubai route at 3h elapsed
  const estLat = '8.2°N', estLng = '77.4°E'
  const qiblaBearing = 284
  const relativeDir  = 'LEFT OF NOSE'
  const relativeAng  = 31

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Auto-detect banner */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        background: 'rgba(var(--cp-acc-rgb,63,224,197),0.06)',
        border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.2)',
        borderRadius: 6, padding: '8px 12px', marginBottom: 16,
      }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>✈️</span>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 8, color: T.acc,
            letterSpacing: '0.14em', marginBottom: 2 }}>FLIGHT MODE DETECTED</div>
          <div style={{ fontFamily: T.sans, fontSize: 11, color: T.dim, lineHeight: 1.5 }}>
            Device appears to be offline. Enter your flight details below for in-flight prayer times and Qibla.
          </div>
        </div>
      </div>

      {/* Route */}
      <Section title="ROUTE">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'end' }}>
          <Field label="DEPARTURE (ICAO)" value={dep} onChange={setDep} placeholder="WMKK" />
          <span style={{ fontFamily: T.mono, fontSize: 16, color: T.dim,
            paddingBottom: 10 }}>→</span>
          <Field label="DESTINATION (ICAO)" value={dest} onChange={setDest} placeholder="OMDB" />
        </div>
        <Field
          label="ELAPSED FLIGHT TIME"
          value={elapsed}
          onChange={setElapsed}
          placeholder="3"
          unit="HRS"
          type="number"
          hint="Time since departure — used to estimate current position along route"
        />
      </Section>

      {/* Aircraft */}
      <Section title="AIRCRAFT">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="ALTITUDE" value={altitude} onChange={setAltitude} placeholder="35000" unit="FT" type="number" />
          <Field label="HEADING" value={heading} onChange={setHeading} placeholder="315" unit="°" type="number" />
        </div>
      </Section>

      {/* Calculate button */}
      <button
        onClick={() => setComputed(true)}
        style={{
          width: '100%', padding: '11px',
          background: 'rgba(var(--cp-acc-rgb,63,224,197),0.12)',
          border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.35)',
          borderRadius: 6, cursor: 'pointer',
          fontFamily: T.mono, fontSize: 10,
          letterSpacing: '0.16em', color: T.acc,
          marginBottom: 18,
        }}
      >
        ⊕ CALCULATE
      </button>

      {/* Results */}
      {computed && (
        <>
          {/* Estimated position */}
          <Section title="ESTIMATED POSITION">
            <div style={{
              background: T.bg2, border: `1px solid ${T.bord2}`,
              borderRadius: 6, padding: '10px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 700,
                  color: T.ink, letterSpacing: '0.04em' }}>
                  {estLat} &nbsp; {estLng}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim,
                  letterSpacing: '0.1em', marginTop: 3 }}>
                  KUALA LUMPUR → DUBAI · 3H ELAPSED
                </div>
              </div>
              <span style={{ fontSize: 22 }}>🌏</span>
            </div>
          </Section>

          {/* Qibla */}
          <Section title="QIBLA FROM CURRENT POSITION">
            <div style={{
              background: T.bg2, border: `1px solid ${T.bord2}`,
              borderRadius: 6, padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: 32, fontWeight: 700,
                    color: T.acc, lineHeight: 1 }}>{qiblaBearing}°</div>
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim,
                    letterSpacing: '0.12em', marginTop: 4 }}>TOWARD MECCA</div>
                </div>
                <span style={{ fontSize: 32 }}>🕋</span>
              </div>
              {/* Cabin-relative direction */}
              <div style={{
                background: 'rgba(var(--cp-acc-rgb,63,224,197),0.07)',
                border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.2)',
                borderRadius: 6, padding: '8px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>✈️</span>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: T.acc,
                    letterSpacing: '0.12em', marginBottom: 2 }}>CABIN DIRECTION</div>
                  <div style={{ fontFamily: T.sans, fontSize: 12, color: T.ink2 }}>
                    Face <strong style={{ color: T.ink }}>{relativeAng}°</strong> to the{' '}
                    <strong style={{ color: T.acc }}>{relativeDir}</strong> of the aircraft
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* In-flight prayer times */}
          <Section title="IN-FLIGHT PRAYER TIMES">
            <div style={{
              fontFamily: T.mono, fontSize: 8, color: T.dim,
              letterSpacing: '0.1em', marginBottom: 4,
            }}>
              ALTITUDE CORRECTED · 35,000 FT
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {FLIGHT_TIMES.map(row => <PrayerRow key={row.name} {...row} />)}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: T.dim,
              letterSpacing: '0.08em', textAlign: 'center', marginTop: 6 }}>
              TIMES SHOWN IN UTC+8 · BASED ON JAKIM METHOD
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

// ── Mockup shell ──────────────────────────────────────────────────────────────
export default function FlightMockup() {
  const [tab, setTab] = useState('flight')

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--cp-bg)',
      fontFamily: 'var(--cb-font-body)',
      padding: '24px',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          fontFamily: T.mono, fontSize: 9, color: T.acc,
          letterSpacing: '0.2em', marginBottom: 20,
          padding: '8px 0', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          🕌 QIBLAT &amp; SOLAT
          <span style={{ fontFamily: T.sans, fontSize: 10, color: T.dim,
            letterSpacing: 0, fontStyle: 'italic' }}>— mockup</span>
        </div>

        <SubNav active={tab} onChange={setTab} />

        {tab === 'flight' && <FlightTab />}
        {tab === 'solat' && (
          <div style={{ textAlign: 'center', padding: '40px 0',
            fontFamily: T.mono, fontSize: 10, color: T.dim, letterSpacing: '0.12em' }}>
            ← EXISTING SOLAT TAB
          </div>
        )}
        {tab === 'qiblat' && (
          <div style={{ textAlign: 'center', padding: '40px 0',
            fontFamily: T.mono, fontSize: 10, color: T.dim, letterSpacing: '0.12em' }}>
            ← EXISTING QIBLAT TAB
          </div>
        )}
      </div>
    </div>
  )
}
