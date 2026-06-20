import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { T } from '../components/tokens'
import { useFlight, formatInTz, getUtcOffsetStr } from '../hooks/useFlight'

// Vertical pixels per hour of flight time, for spacing timeline rows
// proportionally to the real time gap between events (not just row count).
const PX_PER_HOUR = 14
const MIN_GAP = 14
// Every marker is one of two sizes — most are uniform rings so the line
// only ever has to deal with one shape; the live position badge is bigger
// since it's the one marker meant to stand out.
const MARKER_SIZE  = 14
const CURRENT_SIZE = 24
// Clearance (px) the connecting line leaves on either side of a marker's
// edge — segments are measured against markers' real rendered positions, so
// this gap is a hard guarantee, not a hope that z-order hides the overlap.
const MARKER_GAP = 4

// Short labels for the footer note
const METHOD_SHORT = {
  jakim:        'JAKIM',
  moonsighting: 'MOONSIGHTING',
  mwl:          'MWL',
  isna:         'ISNA',
  egyptian:     'EGYPTIAN',
  uaq:          'UMM AL-QURA',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function Field({ label, value, onChange, placeholder, unit, type = 'text', hint, error: fieldError, inlineSuffix }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: T.mono, fontSize: 8, color: T.dim,
        letterSpacing: '0.14em', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <input
            type={inlineSuffix ? 'text' : type}
            inputMode={type === 'number' || inlineSuffix ? 'decimal' : undefined}
            value={value}
            onChange={e => onChange(
              inlineSuffix
                ? e.target.value.replace(new RegExp(inlineSuffix, 'g'), '').replace(/[^0-9.]/g, '')
                : e.target.value
            )}
            placeholder={placeholder}
            autoComplete="off" autoCorrect="off"
            autoCapitalize={type === 'text' && !inlineSuffix ? 'characters' : 'off'}
            spellCheck="false"
            style={{
              width: '100%', minWidth: 0, background: T.bg1,
              border: `1px solid ${fieldError ? 'rgba(251,146,60,0.5)' : T.bord2}`,
              borderRadius: 6, color: T.ink,
              fontFamily: T.mono, fontSize: 14,
              padding: inlineSuffix ? '9px 28px 9px 12px' : '9px 12px',
              outline: 'none', letterSpacing: '0.06em',
            }}
          />
          {inlineSuffix && value !== '' && (
            <span style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              fontFamily: T.mono, fontSize: 14, color: T.dim,
              pointerEvents: 'none', letterSpacing: '0.06em',
            }}>{inlineSuffix}</span>
          )}
        </div>
        {unit && !inlineSuffix && (
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

// Departure/arrival anchor at either end of the timeline. Same ring family
// as every other marker — solid border for departure (already happened),
// dashed for arrival (not reached yet) — rather than a flat filled disc or a
// fully transparent hollow circle, so the connecting line never needs to
// hide behind (or visibly cross) a different shape than everywhere else.
function TimelineEndpoint({ label, time, isDeparture, marginBottom, markerRef }) {
  return (
    <div style={{ position: 'relative', marginBottom, opacity: isDeparture ? 0.6 : 1 }}>
      <span ref={markerRef} style={{
        position: 'absolute', left: -24.5, top: 2, width: MARKER_SIZE, height: MARKER_SIZE, borderRadius: '50%',
        background: T.bg1,
        border: isDeparture ? `2px solid ${T.ink}` : `2px dashed ${T.border}`,
      }} />
      <span style={{ fontFamily: T.sans, fontSize: 13, color: T.ink }}>
        {label}{time ? ` · ${isDeparture ? 'departed' : 'arrives'} ${time}` : ''}
      </span>
    </div>
  )
}

// One prayer event along the route — dimmed once past, accented if it's next.
// Same ring shape/size as the endpoints; only border color signals state.
function TimelinePrayerRow({ name, dayIndex, time, elapsedHours, position, done, isNext, isSunrise, marginBottom, markerRef }) {
  return (
    <div style={{
      position: 'relative', marginBottom,
      opacity: isSunrise ? 0.55 : done ? 0.38 : 1,
      ...(isNext ? {
        background: 'rgba(var(--cp-acc-rgb,63,224,197),0.07)',
        border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.25)',
        borderRadius: 6, padding: '8px 10px', marginLeft: -10,
      } : {}),
    }}>
      <span ref={markerRef} style={{
        position: 'absolute', left: isNext ? -14.5 : -24.5, top: isNext ? 10 : 2,
        width: MARKER_SIZE, height: MARKER_SIZE, borderRadius: '50%',
        background: T.bg1, border: `2px solid ${isNext ? 'var(--cp-acc)' : T.dim}`,
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: T.sans, fontSize: 13, color: isNext ? 'var(--cp-acc)' : T.ink }}>
          {name}
          {dayIndex > 1 && (
            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, marginLeft: 5 }}>DAY {dayIndex}</span>
          )}
          {isSunrise && (
            <span style={{ fontFamily: T.mono, fontSize: 7, color: T.dim, letterSpacing: '0.1em', marginLeft: 6 }}>SUNRISE</span>
          )}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 13, color: isNext ? 'var(--cp-acc)' : T.ink2 }}>{time}</span>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: isNext ? 'var(--cp-acc)' : T.dim,
        opacity: isNext ? 0.85 : 1, marginTop: 2 }}>
        {fmtElapsed(elapsedHours)} · {latStr(position.lat)} {lngStr(position.lng)}
      </div>
    </div>
  )
}

// Live aircraft position, inserted into the timeline at its chronological slot.
function CurrentPositionCard({ elapsedHours, position, elapsedNm, remainNm, fraction, onRefresh, marginBottom, markerRef }) {
  return (
    <div style={{
      position: 'relative', marginBottom, marginLeft: -10,
      border: `1px dashed ${T.bord2}`, borderRadius: 6, padding: '8px 10px',
    }}>
      <span ref={markerRef} style={{
        position: 'absolute', left: -19.5, top: 4, width: CURRENT_SIZE, height: CURRENT_SIZE, borderRadius: '50%',
        background: T.bg1, border: '2px solid var(--cp-acc)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, lineHeight: 1,
      }}>✈️</span>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.08em' }}>
          CURRENT POSITION · {fmtElapsed(elapsedHours)}
        </span>
        <button onClick={onRefresh} title="Refresh current position" style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--cp-acc)', fontSize: 13, padding: 0, lineHeight: 1,
        }}>↻</button>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 13, color: T.ink, marginTop: 2 }}>
        {latStr(position.lat)} {lngStr(position.lng)}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dim, marginTop: 2 }}>
        {elapsedNm} NM flown · {remainNm} NM remaining · {Math.round(fraction * 100)}% complete
      </div>
    </div>
  )
}

/**
 * Top-down airplane SVG with a rotating arrow showing which direction
 * Mecca is relative to the cabin. Nose always points up.
 */
function CabinDirectionDial({ cabin }) {
  const size = 160
  const cx = size / 2
  const cy = size / 2
  const R  = 58   // arrow radius from centre

  // Convert cabin side + angle → a single clockwise rotation from nose (up)
  const rotation =
    cabin.side === 'AHEAD'  ? 0 :
    cabin.side === 'BEHIND' ? 180 :
    cabin.side === 'RIGHT'  ? cabin.angle :
    360 - cabin.angle        // LEFT

  const rad = (rotation * Math.PI) / 180
  // Arrow tip position (0° = up, clockwise)
  const tx = cx + R * Math.sin(rad)
  const ty = cy - R * Math.cos(rad)

  const label =
    cabin.side === 'AHEAD'  ? 'FACE FORWARD (NOSE)' :
    cabin.side === 'BEHIND' ? 'FACE REARWARD (TAIL)' :
    `${cabin.angle}° TO THE ${cabin.side}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: 'visible' }}>

        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={size / 2 - 2}
          fill="rgba(var(--cp-acc-rgb,63,224,197),0.04)"
          stroke="rgba(var(--cp-acc-rgb,63,224,197),0.18)" strokeWidth={1} />

        {/* NOSE / TAIL labels on ring */}
        <text x={cx} y={10} textAnchor="middle" dominantBaseline="central"
          fontFamily="var(--cb-font-mono)" fontSize={7} fill="var(--cp-dim)"
          letterSpacing="2">NOSE</text>
        <text x={cx} y={size - 10} textAnchor="middle" dominantBaseline="central"
          fontFamily="var(--cb-font-mono)" fontSize={7} fill="var(--cp-dim)"
          letterSpacing="2">TAIL</text>

        {/* ── Airplane top-down silhouette (nose = up) ── */}
        <g transform={`translate(${cx}, ${cy})`} opacity={0.65} fill="var(--cp-muted)">
          <path d="M0,-34 C3,-34 5,-30 5,-20 L5,28 C5,30 3,32 0,32 C-3,32 -5,30 -5,28 L-5,-20 C-5,-30 -3,-34 0,-34 Z" />
          <path d="M-5,-8 L-38,4 L-38,10 L-5,4 Z" />
          <path d="M5,-8 L38,4 L38,10 L5,4 Z" />
          <path d="M-4,22 L-20,30 L-20,34 L-4,28 Z" />
          <path d="M4,22 L20,30 L20,34 L4,28 Z" />
        </g>

        {/* Direction arrow (rotates around centre) */}
        <g transform={`rotate(${rotation}, ${cx}, ${cy})`}>
          {/* Shaft */}
          <line x1={cx} y1={cy} x2={cx} y2={cy - R + 14}
            stroke="var(--cp-acc)" strokeWidth={2.5} strokeLinecap="round" />
          {/* Arrowhead */}
          <polygon
            points={`${cx},${cy - R} ${cx - 7},${cy - R + 14} ${cx + 7},${cy - R + 14}`}
            fill="var(--cp-acc)" />
        </g>

        {/* Kaaba emoji at arrow tip */}
        <text x={tx} y={ty}
          textAnchor="middle" dominantBaseline="central"
          fontSize={13} style={{ userSelect: 'none' }}>🕋</text>

        {/* Centre pivot */}
        <circle cx={cx} cy={cy} r={4}
          fill="var(--cp-bg2)" stroke="var(--cp-acc)" strokeWidth={1.5} />
      </svg>

      {/* Direction label */}
      <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '0.14em',
        color: 'var(--cp-acc)', textAlign: 'center' }}>
        {label}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(hours) {
  const totalMin = Math.round(hours * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// "20 JUN 2026" — the calendar date prayer times were calculated for, in tzId.
function fmtCalcDate(date, tzId) {
  if (!(date instanceof Date)) return ''
  const opts = { day: '2-digit', month: 'short', year: 'numeric' }
  if (tzId) opts.timeZone = tzId
  return new Intl.DateTimeFormat('en-GB', opts).format(date).toUpperCase()
}

// Normalise "930" / "09:30" → "09:30"
function fmtTime(raw) {
  const d = String(raw ?? '').replace(/[^0-9]/g, '')
  if (d.length < 3 || d.length > 4) return raw
  const h = d.slice(0, d.length - 2).padStart(2, '0')
  const m = d.slice(-2)
  return `${h}:${m}`
}

// "T+4:25" — elapsed time since departure, for timeline rows.
function fmtElapsed(hours) {
  const totalMin = Math.round(hours * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `T+${h}:${String(m).padStart(2, '0')}`
}

// Calendar-day number for `date` as seen in tzId's own clock — used to tag
// repeated prayers ("day 2") on flights long enough to span midnight.
function localDayNum(date, tzId) {
  if (!tzId) return Math.floor(date.getTime() / 86_400_000)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tzId, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(date).map(({ type, value }) => [type, value])
  )
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000
}

function FlightTimeBanner({ clockInfo, dep, dest, depTime, arrTime, timeZone }) {
  const { totalHours, depTzStr, destTzStr, tzAware } = clockInfo
  const timeLabel = timeZone === 'utc' ? 'UTC' : 'LOCAL'

  return (
    <div style={{
      background: T.bg1,
      border: `1px solid ${T.bord2}`,
      borderRadius: 6,
      padding: '10px 12px',
    }}>
      {/* Row 1: tz labels + duration */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: T.mono, fontSize: 10, color: T.dim, letterSpacing: '0.1em' }}>
          {dep && <span>{dep}</span>}
          {tzAware && depTzStr && <span style={{ color: 'var(--cp-acc)', fontSize: 9 }}>{depTzStr}</span>}
          <span style={{ color: T.dim, fontSize: 8 }}>→</span>
          {dest && <span>{dest}</span>}
          {tzAware && destTzStr && <span style={{ color: 'var(--cp-acc)', fontSize: 9 }}>{destTzStr}</span>}
          {!tzAware && <span style={{ color: T.orange, fontSize: 8 }}>(TZ UNKNOWN)</span>}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700, color: T.ink, letterSpacing: '0.04em' }}>
          {formatDuration(totalHours)}
        </div>
      </div>
      {/* Row 2: times with label */}
      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.08em' }}>
        {fmtTime(depTime)} {dep} {timeLabel} → {fmtTime(arrTime)} {dest} {timeLabel}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FlightPage({ settings }) {
  const {
    inputs, setInputs,
    depAirport, destAirport,
    isOffline,
    clockInfo,
    result, error,
    calculate,
    isStale,
  } = useFlight()

  // Purely cosmetic delay so CALCULATE visibly "does work" even though the
  // underlying math is instant — otherwise results swap in with no feedback
  // that anything happened.
  const [isCalculating, setIsCalculating] = useState(false)
  const handleCalculate = () => {
    setIsCalculating(true)
    setTimeout(() => {
      calculate()
      setIsCalculating(false)
    }, 500)
  }

  const { dep, dest, mode = 'duration', elapsedHours, totalHours,
          depTime = '', arrTime = '', timeZone = 'utc', altitudeFt, headingDeg,
          prayerTzView = 'dep' } = inputs

  // Which watch the prayer-time list is shown on: departure-zone or arrival-zone.
  const prayerTzId    = prayerTzView === 'dep' ? depAirport?.tz : destAirport?.tz
  const prayerTzAware = !!prayerTzId
  const timeFmt       = settings?.timeFormat ?? '24hr'

  const seg = (on) => ({
    flex: 1, fontFamily: T.mono, fontSize: 9, letterSpacing: '0.12em',
    padding: '7px 0', borderRadius: 6, cursor: 'pointer',
    border: `1px solid ${on ? 'var(--cp-acc)' : 'var(--cp-border2)'}`,
    background: on ? 'var(--cp-accdim)' : 'transparent',
    color: on ? 'var(--cp-acc)' : T.dim,
  })

  // The connecting line is rendered as discrete segments between markers'
  // actual rendered positions (not a flat time-fraction percentage, and not
  // one continuous bar relying on z-order to hide behind each marker) — so
  // it is geometrically impossible for the line to touch a marker's edge.
  const timelineContainerRef = useRef(null)
  const markerRefs = useRef([])
  const [segments, setSegments] = useState([])

  // Merge the precomputed prayer timeline with a live "current position"
  // marker, inserted at its correct chronological slot.
  const depClock = result ? formatInTz(new Date(result.depInstantMs), prayerTzId, timeFmt) : ''
  const arrClock = result
    ? formatInTz(new Date(result.depInstantMs + result.totalHours * 3_600_000), prayerTzId, timeFmt)
    : ''

  // Memoized so this array keeps a stable reference across re-renders that
  // don't actually change the underlying data — the line-segment effect
  // below depends on it, and a fresh array identity every render would
  // re-trigger that effect's setState forever (arrays never compare equal
  // by reference the way the old numeric fillHeight/bgHeight state did).
  const timelineRows = useMemo(() => {
    if (!result) return []
    const now = new Date()
    const depDate = new Date(result.depInstantMs)
    const events = result.timeline.map(ev => ({
      kind:         'prayer',
      name:         ev.name,
      date:         ev.date,
      elapsedHours: ev.elapsedHours,
      position:     ev.position,
      isSunrise:    ev.name === 'Sunrise',
      dayIndex:     localDayNum(ev.date, prayerTzId) - localDayNum(depDate, prayerTzId) + 1,
    }))

    const nextPrayer = events.find(e => !e.isSunrise && e.date > now)

    const current = {
      kind:         'current',
      elapsedHours: result.elapsedHours,
      position:     result.position,
    }
    const insertAt = events.findIndex(e => e.elapsedHours > result.elapsedHours)
    const merged = insertAt === -1
      ? [...events, current]
      : [...events.slice(0, insertAt), current, ...events.slice(insertAt)]

    return merged.map(row => row.kind === 'current' ? row : {
      ...row,
      time:   formatInTz(row.date, prayerTzId, timeFmt),
      done:   row.date < now,
      isNext: row === nextPrayer,
    })
  }, [result, prayerTzId, timeFmt])

  // Gap (px) below each row, proportional to the elapsed-time distance to
  // the next anchor (departure → ...rows... → arrival) — floored so close
  // events stay readable. This is what makes the line fill above line up
  // with the current-position card's actual rendered position.
  const rowGaps = result ? (() => {
    const anchors = [0, ...timelineRows.map(r => r.elapsedHours), result.totalHours]
    return anchors.slice(0, -1).map((t, i) => Math.max(MIN_GAP, (anchors[i + 1] - t) * PX_PER_HOUR))
  })() : []

  useLayoutEffect(() => {
    if (!result || !timelineContainerRef.current) {
      setSegments([])
      return
    }
    const measure = () => {
      const containerTop = timelineContainerRef.current.getBoundingClientRect().top
      const boxes = markerRefs.current.map(el => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { top: r.top - containerTop, bottom: r.bottom - containerTop }
      })
      // dep is index 0, arr is the last index — current position's index
      // among timelineRows shifts by +1 to match that offset.
      const currentIdx = 1 + timelineRows.findIndex(r => r.kind === 'current')
      const segs = []
      for (let i = 0; i < boxes.length - 1; i++) {
        const a = boxes[i], b = boxes[i + 1]
        if (!a || !b) continue
        const top    = a.bottom + MARKER_GAP
        const height = Math.max(0, (b.top - MARKER_GAP) - top)
        segs.push({ top, height, accent: i + 1 <= currentIdx })
      }
      setSegments(segs)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [result, timelineRows])

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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'start', minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <Field
              label="DEPARTURE (ICAO)"
              value={dep}
              onChange={v => setInputs({ dep: v.toUpperCase() })}
              placeholder="WMKK"
            />
            <AirportTag airport={depAirport} icao={dep} />
          </div>
          <button
            onClick={() => setInputs({ dep: dest, dest: dep })}
            title="Swap departure and destination"
            style={{
              fontFamily: T.mono, fontSize: 14, color: T.dim,
              paddingTop: 28, display: 'block', flexShrink: 0,
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '28px 4px 0', lineHeight: 1,
            }}
          >⇄</button>
          <div style={{ minWidth: 0 }}>
            <Field
              label="DESTINATION (ICAO)"
              value={dest}
              onChange={v => setInputs({ dest: v.toUpperCase() })}
              placeholder="OMDB"
            />
            <AirportTag airport={destAirport} icao={dest} />
          </div>
        </div>

        {/* ── Time mode toggle ── */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[['duration', 'DURATION'], ['clock', 'CLOCK TIME']].map(([id, label]) => (
            <button key={id} onClick={() => setInputs({ mode: id })} style={seg(mode === id)}>{label}</button>
          ))}
        </div>

        {mode === 'clock' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, minWidth: 0 }}>
              <Field label="DEP TIME (ETD)" value={depTime} onChange={v => setInputs({ depTime: v })}
                placeholder="0930" hint="HH:MM" />
              <Field label="ARR TIME (ETA)" value={arrTime} onChange={v => setInputs({ arrTime: v })}
                placeholder="1730" hint="HH:MM" />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['utc', 'UTC / ZULU'], ['local', 'LOCAL']].map(([id, label]) => (
                <button key={id} onClick={() => setInputs({ timeZone: id })} style={seg(timeZone === id)}>{label}</button>
              ))}
            </div>
            {clockInfo && <FlightTimeBanner
              clockInfo={clockInfo}
              dep={dep} dest={dest}
              depTime={depTime} arrTime={arrTime}
              timeZone={timeZone}
            />}
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, minWidth: 0 }}>
            <Field label="ELAPSED TIME" value={elapsedHours} onChange={v => setInputs({ elapsedHours: v })}
              placeholder="3.5" unit="HRS" type="number" hint="Time since departure" />
            <Field label="TOTAL FLIGHT TIME" value={totalHours} onChange={v => setInputs({ totalHours: v })}
              placeholder="7.0" unit="HRS" type="number" hint="Estimated total duration" />
          </div>
        )}
      </Section>

      {/* Aircraft */}
      <Section title="AIRCRAFT">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, minWidth: 0 }}>
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
            placeholder="234°"
            inlineSuffix="°"
            hint="Optional — check moving map on your IFE screen"
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

      {/* Calculate button — orange "stale" state once any input changes
          after a calculation, so old results on screen are never mistaken
          for current; spinner is a cosmetic delay since the math itself is
          instant and would otherwise swap in with no feedback. */}
      <button
        onClick={handleCalculate}
        disabled={isCalculating}
        style={{
          width: '100%', padding: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: isCalculating
            ? 'rgba(255,255,255,0.04)'
            : isStale ? 'rgba(251,146,60,0.12)' : 'rgba(var(--cp-acc-rgb,63,224,197),0.12)',
          border: `1px solid ${isCalculating
            ? T.bord2
            : isStale ? 'rgba(251,146,60,0.35)' : 'rgba(var(--cp-acc-rgb,63,224,197),0.35)'}`,
          borderRadius: 6, cursor: isCalculating ? 'default' : 'pointer',
          fontFamily: T.mono, fontSize: 10,
          letterSpacing: '0.16em',
          color: isCalculating ? T.dim : isStale ? T.orange : 'var(--cp-acc)',
          marginBottom: 20,
        }}
      >
        {isCalculating ? (
          <>
            <span style={{
              width: 12, height: 12, borderRadius: '50%',
              border: '2px solid var(--cp-border)', borderTopColor: 'var(--cp-acc)',
              display: 'inline-block', animation: 'cp-spin 0.7s linear infinite',
            }} />
            CALCULATING…
          </>
        ) : isStale ? '⊕ RECALCULATE' : '⊕ CALCULATE'}
      </button>

      {/* Results */}
      {result && (
        <>
          {/* Qibla */}
          <Section title="QIBLA FROM CURRENT POSITION">
            <div style={{
              background: T.bg1, border: `1px solid ${T.bord2}`,
              borderRadius: 6, padding: '12px 14px',
            }}>
              {/* Bearing readout */}
              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: 36, fontWeight: 700,
                    color: 'var(--cp-acc)', lineHeight: 1 }}>{result.bearing}°</div>
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dim,
                    letterSpacing: '0.12em', marginTop: 4 }}>FROM TRUE NORTH</div>
                </div>
                <span style={{ fontSize: 36 }}>🕋</span>
              </div>

              {/* Cabin direction — airplane diagram */}
              {result.cabin ? (
                <div style={{
                  background: 'rgba(var(--cp-acc-rgb,63,224,197),0.05)',
                  border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.18)',
                  borderRadius: 8, padding: '14px 12px',
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: 8, color: 'var(--cp-acc)',
                    letterSpacing: '0.16em', textAlign: 'center', marginBottom: 12 }}>
                    CABIN DIRECTION
                  </div>
                  <CabinDirectionDial cabin={result.cabin} />
                </div>
              ) : (
                <div style={{ fontFamily: T.sans, fontSize: 11, color: T.dim,
                  lineHeight: 1.5 }}>
                  Enter aircraft heading above to see cabin-relative Qibla direction.
                </div>
              )}
            </div>
          </Section>

          {/* Prayer times */}
          <Section title="IN-FLIGHT PRAYER TIMES">
            {/* Watch toggle — same in-flight prayer moment, shown on either zone's clock */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <button
                onClick={() => setInputs({ prayerTzView: 'dep' })}
                style={seg(prayerTzView === 'dep')}
              >DEP TIME{depAirport?.tz ? ` (${getUtcOffsetStr(depAirport.tz)})` : ''}</button>
              <button
                onClick={() => setInputs({ prayerTzView: 'arr' })}
                style={seg(prayerTzView === 'arr')}
              >ARR TIME{destAirport?.tz ? ` (${getUtcOffsetStr(destAirport.tz)})` : ''}</button>
            </div>
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
            <div ref={timelineContainerRef} style={{ position: 'relative', paddingLeft: 28, marginTop: 14 }}>
              {segments.map((seg, i) => (
                <div key={i} style={{
                  position: 'absolute', left: 9.75, width: 1.5, borderRadius: 1,
                  top: `${seg.top}px`, height: `${seg.height}px`,
                  background: seg.accent ? 'var(--cp-acc)' : T.bord2,
                }} />
              ))}

              <TimelineEndpoint
                label={dep} time={depClock} isDeparture marginBottom={rowGaps[0]}
                markerRef={el => { markerRefs.current[0] = el }}
              />
              {timelineRows.map((row, i) => row.kind === 'current'
                ? (
                  <CurrentPositionCard
                    key="current"
                    elapsedHours={row.elapsedHours}
                    position={row.position}
                    elapsedNm={result.elapsedNm}
                    remainNm={result.remainNm}
                    fraction={result.fraction}
                    onRefresh={calculate}
                    marginBottom={rowGaps[i + 1]}
                    markerRef={el => { markerRefs.current[i + 1] = el }}
                  />
                )
                : (
                  <TimelinePrayerRow
                    key={`${row.name}-${i}`} {...row} marginBottom={rowGaps[i + 1]}
                    markerRef={el => { markerRefs.current[i + 1] = el }}
                  />
                )
              )}
              <TimelineEndpoint
                label={dest} time={arrClock} marginBottom={0}
                markerRef={el => { markerRefs.current[timelineRows.length + 1] = el }}
              />
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: T.dim,
              letterSpacing: '0.08em', textAlign: 'center', marginTop: 8,
              lineHeight: 1.8 }}>
              {prayerTzAware
                ? `${prayerTzView === 'dep' ? 'DEPARTURE' : 'ARRIVAL'} TIME (${getUtcOffsetStr(prayerTzId)})`
                : 'DEVICE LOCAL TIME — TZ UNKNOWN'} · {METHOD_SHORT[settings?.calculationMethod] ?? 'JAKIM'} METHOD
              <br />
              CALCULATED FOR {fmtCalcDate(new Date(result.depInstantMs), prayerTzId)}
            </div>
          </Section>

          {/* Dead reckoning disclaimer */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            background: 'rgba(251,146,60,0.05)',
            border: '1px solid rgba(251,146,60,0.18)',
            borderRadius: 6, padding: '10px 12px', marginTop: 4,
          }}>
            <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>⚠</span>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: 8, color: T.orange,
                letterSpacing: '0.14em', marginBottom: 4 }}>
                ESTIMATED TIME AND POSITION ONLY
              </div>
              <div style={{ fontFamily: T.sans, fontSize: 11, color: T.dim, lineHeight: 1.6 }}>
                Prayer times and Qibla direction are calculated using dead reckoning and carry a margin of error.
                Recheck closer to departure or while inflight for the best accuracy.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
