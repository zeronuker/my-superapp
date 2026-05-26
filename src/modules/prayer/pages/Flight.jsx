import { T } from '../components/tokens'
import { useFlight } from '../hooks/useFlight'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n, dec = 4) {
  if (n == null) return '—'
  const abs = Math.abs(n).toFixed(dec)
  return n >= 0 ? abs : `-${abs}`
}

function latStr(lat) {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`
}
function lngStr(lng) {
  return `${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontFamily: T.mono, fontSize: 8, color: 'var(--cp-acc)',
        letterSpacing: '0.18em', marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {title}
        <div style={{ flex: 1, height: 1,
          background: 'rgba(var(--cp-acc-rgb,63,224,197),0.2)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, unit, type = 'text', hint, error: fieldError }) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: 8, color: T.dim,
        letterSpacing: '0.14em', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type={type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck="false"
          style={{
            flex: 1, background: T.bg1,
            border: `1px solid ${fieldError ? 'rgba(251,146,60,0.5)' : T.bord2}`,
            borderRadius: 6, color: T.ink,
            fontFamily: T.mono, fontSize: 14,
            padding: '9px 12px', outline: 'none',
            letterSpacing: '0.06em',
          }}
        />
        {unit && (
          <span style={{ fontFamily: T.mono, fontSize: 10,
            color: T.dim, letterSpacing: '0.1em', flexShrink: 0 }}>{unit}</span>
        )}
      </div>
      {hint && (
        <div style={{ fontFamily: T.sans, fontSize: 10, color: T.dim,
          marginTop: 4, lineHeight: 1.5 }}>{hint}</div>
      )}
    </div>
  )
}

function AirportTag({ airport, icao }) {
  if (!icao) return null
  if (!airport) return (
    <div style={{ fontFamily: T.mono, fontSize: 9, color: T.orange,
      letterSpacing: '0.08em', marginTop: 4 }}>
      Airport not found
    </div>
  )
  return (
    <div style={{ fontFamily: T.sans, fontSize: 11, color: 'var(--cp-acc)',
      marginTop: 4, lineHeight: 1.4 }}>
      {airport.name} · {airport.city}, {airport.country}
    </div>
  )
}

function PrayerRow({ name, time, done, isNext, isSunrise }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px',
      background: isNext ? 'rgba(var(--cp-acc-rgb,63,224,197),0.07)' : 'transparent',
      border: `1px solid ${isNext ? 'rgba(var(--cp-acc-rgb,63,224,197),0.25)' : T.border}`,
      borderRadius: 6,
      opacity: isSunrise ? 0.55 : done ? 0.38 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isNext && (
          <span style={{ width: 6, height: 6, borderRadius: '50%',
            background: 'var(--cp-acc)', display: 'inline-block', flexShrink: 0 }} />
        )}
        <span style={{
          fontFamily: T.sans, fontSize: 13,
          color: isNext ? 'var(--cp-acc)' : T.ink,
          marginLeft: isNext ? 0 : 14,
        }}>{name}</span>
        {isSunrise && (
          <span style={{ fontFamily: T.mono, fontSize: 7,
            color: T.dim, letterSpacing: '0.1em' }}>SUNRISE</span>
        )}
      </div>
      <span style={{ fontFamily: T.mono, fontSize: 13,
        color: isNext ? 'var(--cp-acc)' : T.ink2 }}>{time}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FlightPage({ settings }) {
  const {
    inputs, setInputs,
    depAirport, destAirport,
    isOffline,
    result, error,
    calculate,
  } = useFlight()

  const { dep, dest, elapsedHours, totalHours, altitudeFt, headingDeg } = inputs

  // Build prayer rows from result times
  const now = new Date()
  const prayerRows = result ? [
    { name: 'Fajr',    time: result.times.Fajr,    date: result.times.fajrDate,    isSunrise: false },
    { name: 'Sunrise', time: result.times.Sunrise,  date: result.times.sunriseDate, isSunrise: true  },
    { name: 'Dhuhr',   time: result.times.Dhuhr,   date: result.times.dhuhrDate,   isSunrise: false },
    { name: 'Asr',     time: result.times.Asr,     date: result.times.asrDate,     isSunrise: false },
    { name: 'Maghrib', time: result.times.Maghrib,  date: result.times.maghribDate,  isSunrise: false },
    { name: 'Isha',    time: result.times.Isha,    date: result.times.ishaDate,    isSunrise: false },
  ].map((p, _, arr) => {
    const active = arr.filter(x => !x.isSunrise)
    const next   = active.find(x => x.date instanceof Date && x.date > now) ?? active[0]
    return {
      ...p,
      done:   p.date instanceof Date && p.date < now && !p.isSunrise,
      isNext: !p.isSunrise && p.name === next?.name,
    }
  }) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Offline / manual detection banner */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        background: isOffline
          ? 'rgba(var(--cp-acc-rgb,63,224,197),0.06)'
          : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isOffline
          ? 'rgba(var(--cp-acc-rgb,63,224,197),0.2)'
          : T.bord2}`,
        borderRadius: 6, padding: '8px 12px', marginBottom: 16,
      }}>
        <span style={{ fontSize: 15, flexShrink: 0 }}>✈️</span>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 8,
            color: isOffline ? 'var(--cp-acc)' : T.dim,
            letterSpacing: '0.14em', marginBottom: 2 }}>
            {isOffline ? 'FLIGHT MODE DETECTED — DEVICE IS OFFLINE' : 'IN-FLIGHT PRAYER & QIBLA'}
          </div>
          <div style={{ fontFamily: T.sans, fontSize: 11, color: T.dim, lineHeight: 1.5 }}>
            {isOffline
              ? 'Enter your flight details below for altitude-corrected prayer times and cabin-relative Qibla.'
              : 'Enter your flight details to calculate in-flight prayer times and Qibla direction.'}
          </div>
        </div>
      </div>

      {/* Route */}
      <Section title="ROUTE">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'start' }}>
          <div>
            <Field
              label="DEPARTURE (ICAO)"
              value={dep}
              onChange={v => setInputs({ dep: v.toUpperCase() })}
              placeholder="WMKK"
            />
            <AirportTag airport={depAirport} icao={dep} />
          </div>
          <span style={{ fontFamily: T.mono, fontSize: 18, color: T.dim,
            paddingTop: 28, display: 'block' }}>→</span>
          <div>
            <Field
              label="DESTINATION (ICAO)"
              value={dest}
              onChange={v => setInputs({ dest: v.toUpperCase() })}
              placeholder="OMDB"
            />
            <AirportTag airport={destAirport} icao={dest} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field
            label="ELAPSED TIME"
            value={elapsedHours}
            onChange={v => setInputs({ elapsedHours: v })}
            placeholder="3.5"
            unit="HRS"
            type="number"
            hint="Time since departure"
          />
          <Field
            label="TOTAL FLIGHT TIME"
            value={totalHours}
            onChange={v => setInputs({ totalHours: v })}
            placeholder="7.0"
            unit="HRS"
            type="number"
            hint="Estimated total duration"
          />
        </div>
      </Section>

      {/* Aircraft */}
      <Section title="AIRCRAFT">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field
            label="ALTITUDE"
            value={altitudeFt}
            onChange={v => setInputs({ altitudeFt: v })}
            placeholder="35000"
            unit="FT"
            type="number"
          />
          <Field
            label="TRUE HEADING"
            value={headingDeg}
            onChange={v => setInputs({ headingDeg: v })}
            placeholder="315"
            type="number"
            hint="Optional — check your seat screen moving map, look for Track or Heading"
          />
        </div>
      </Section>

      {/* Error */}
      {error && (
        <div style={{
          fontFamily: T.sans, fontSize: 12, color: T.orange,
          background: 'rgba(251,146,60,0.08)',
          border: '1px solid rgba(251,146,60,0.25)',
          borderRadius: 6, padding: '8px 12px', marginBottom: 12,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Calculate button */}
      <button
        onClick={calculate}
        style={{
          width: '100%', padding: '12px',
          background: 'rgba(var(--cp-acc-rgb,63,224,197),0.12)',
          border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.35)',
          borderRadius: 6, cursor: 'pointer',
          fontFamily: T.mono, fontSize: 10,
          letterSpacing: '0.16em', color: 'var(--cp-acc)',
          marginBottom: 20,
        }}
      >
        ⊕ CALCULATE
      </button>

      {/* Results */}
      {result && (
        <>
          {/* Progress bar */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              fontFamily: T.mono, fontSize: 8, color: T.dim,
              letterSpacing: '0.1em', marginBottom: 6 }}>
              <span>{depAirport?.city}</span>
              <span style={{ color: 'var(--cp-acc)' }}>
                {Math.round(result.fraction * 100)}% COMPLETE
              </span>
              <span>{destAirport?.city}</span>
            </div>
            <div style={{ height: 4, background: T.bg2, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${result.fraction * 100}%`,
                background: 'linear-gradient(90deg, var(--cp-acc), rgba(var(--cp-acc-rgb,63,224,197),0.4))',
                transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: T.dim,
              letterSpacing: '0.08em', marginTop: 5, textAlign: 'center' }}>
              {result.elapsedNm} NM FLOWN · {result.remainNm} NM REMAINING · {result.totalNm} NM TOTAL
            </div>
          </div>

          {/* Estimated position */}
          <Section title="ESTIMATED POSITION">
            <div style={{
              background: T.bg1, border: `1px solid ${T.bord2}`,
              borderRadius: 6, padding: '12px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 700,
                  color: T.ink, letterSpacing: '0.04em', lineHeight: 1.2 }}>
                  {latStr(result.position.lat)}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 700,
                  color: T.ink, letterSpacing: '0.04em', lineHeight: 1.2 }}>
                  {lngStr(result.position.lng)}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 8, color: T.dim,
                  letterSpacing: '0.1em', marginTop: 6 }}>
                  DEAD RECKONING · APPROXIMATE
                </div>
              </div>
              <span style={{ fontSize: 28 }}>🌏</span>
            </div>
          </Section>

          {/* Qibla */}
          <Section title="QIBLA FROM CURRENT POSITION">
            <div style={{
              background: T.bg1, border: `1px solid ${T.bord2}`,
              borderRadius: 6, padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: result.cabin ? 12 : 0 }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: 36, fontWeight: 700,
                    color: 'var(--cp-acc)', lineHeight: 1 }}>{result.bearing}°</div>
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim,
                    letterSpacing: '0.12em', marginTop: 4 }}>FROM TRUE NORTH</div>
                </div>
                <span style={{ fontSize: 36 }}>🕋</span>
              </div>

              {/* Cabin-relative */}
              {result.cabin && (
                <div style={{
                  background: 'rgba(var(--cp-acc-rgb,63,224,197),0.07)',
                  border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.2)',
                  borderRadius: 6, padding: '10px 12px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 20 }}>✈️</span>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: 8,
                      color: 'var(--cp-acc)', letterSpacing: '0.14em', marginBottom: 3 }}>
                      CABIN DIRECTION
                    </div>
                    {result.cabin.side === 'AHEAD' ? (
                      <div style={{ fontFamily: T.sans, fontSize: 13, color: T.ink }}>
                        Face <strong style={{ color: 'var(--cp-acc)' }}>straight ahead</strong> toward the aircraft nose
                      </div>
                    ) : result.cabin.side === 'BEHIND' ? (
                      <div style={{ fontFamily: T.sans, fontSize: 13, color: T.ink }}>
                        Face <strong style={{ color: T.orange }}>toward the tail</strong> of the aircraft
                      </div>
                    ) : (
                      <div style={{ fontFamily: T.sans, fontSize: 13, color: T.ink }}>
                        Face <strong style={{ color: 'var(--cp-acc)' }}>{result.cabin.angle}°</strong> to the{' '}
                        <strong style={{ color: 'var(--cp-acc)' }}>
                          {result.cabin.side === 'LEFT' ? '← LEFT' : 'RIGHT →'}
                        </strong>{' '}of the aircraft
                      </div>
                    )}
                  </div>
                </div>
              )}
              {!result.cabin && (
                <div style={{ fontFamily: T.sans, fontSize: 11, color: T.dim,
                  marginTop: 8, lineHeight: 1.5 }}>
                  Enter aircraft heading above to see cabin-relative direction.
                </div>
              )}
            </div>
          </Section>

          {/* Prayer times */}
          <Section title="IN-FLIGHT PRAYER TIMES">
            <div style={{ fontFamily: T.mono, fontSize: 8, color: T.dim,
              letterSpacing: '0.1em', marginBottom: 4,
              display: 'flex', justifyContent: 'space-between' }}>
              <span>ALTITUDE CORRECTED</span>
              {result.corrMin > 0 && (
                <span style={{ color: 'var(--cp-acc)' }}>
                  ±{result.corrMin} MIN AT {parseInt(altitudeFt).toLocaleString()} FT
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {prayerRows.map(row => <PrayerRow key={row.name} {...row} />)}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: T.dim,
              letterSpacing: '0.08em', textAlign: 'center', marginTop: 8,
              lineHeight: 1.8 }}>
              BASED ON DEVICE LOCAL TIME · JAKIM METHOD{'\n'}
              TIMES ARE APPROXIMATE — VERIFY WITH CREW
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
