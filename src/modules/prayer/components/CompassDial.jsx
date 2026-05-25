import { T } from './tokens'

// Cardinal labels in Malay (standard for Malaysian Islamic compass)
const CARDINALS = [
  { label: 'U', angle: 0   },   // Utara  — North
  { label: 'T', angle: 90  },   // Timur  — East
  { label: 'S', angle: 180 },   // Selatan — South
  { label: 'B', angle: 270 },   // Barat  — West
]

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5)

export default function CompassDial({
  needleAngle  = 0,
  bearing      = 0,
  live         = false,
  permissionNeeded = false,
  onRequestPermission,
}) {
  const size = 230
  const cx = size / 2, cy = size / 2
  const R  = size / 2 - 14

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>

      {/* SVG compass */}
      <svg
        width={size} height={size}
        viewBox={`0 0 ${size} ${size}`}
        onClick={permissionNeeded ? onRequestPermission : undefined}
        style={{ cursor: permissionNeeded ? 'pointer' : 'default', display: 'block' }}
      >
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={R}
          fill="var(--cp-bg3, #1b2340)" stroke="var(--cp-border2)" strokeWidth={1.5} />
        {/* Inner ring */}
        <circle cx={cx} cy={cy} r={R - 22}
          fill="none" stroke="var(--cp-border)" strokeWidth={1} />

        {/* Tick marks */}
        {TICKS.map(deg => {
          const len = deg % 90 === 0 ? 11 : deg % 45 === 0 ? 7 : 4
          const a  = (deg * Math.PI) / 180
          const x1 = cx + (R - 2) * Math.sin(a)
          const y1 = cy - (R - 2) * Math.cos(a)
          const x2 = cx + (R - 2 - len) * Math.sin(a)
          const y2 = cy - (R - 2 - len) * Math.cos(a)
          return (
            <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={deg % 90 === 0 ? 'var(--cp-muted)' : 'var(--cp-border)'}
              strokeWidth={deg % 90 === 0 ? 1.5 : 0.8} />
          )
        })}

        {/* Cardinal labels */}
        {CARDINALS.map(({ label, angle }) => {
          const a  = (angle * Math.PI) / 180
          const lx = cx + (R - 32) * Math.sin(a)
          const ly = cy - (R - 32) * Math.cos(a)
          return (
            <text key={label} x={lx} y={ly}
              textAnchor="middle" dominantBaseline="central"
              fontFamily="var(--cb-font-mono)"
              fontSize={label === 'U' ? 14 : 12}
              fontWeight="700"
              fill={label === 'U' ? 'var(--cp-acc)' : 'var(--cp-muted)'}>
              {label}
            </text>
          )
        })}

        {/* Qibla needle — rotates to needleAngle */}
        <g transform={`rotate(${needleAngle}, ${cx}, ${cy})`}>
          {/* Pointing tip (toward Mecca) */}
          <polygon
            points={`${cx},${cy - R + 38} ${cx - 7},${cy + 14} ${cx + 7},${cy + 14}`}
            fill="var(--cp-acc)" opacity={0.9} />
          {/* Counter tail */}
          <polygon
            points={`${cx},${cy + R - 38} ${cx - 7},${cy - 14} ${cx + 7},${cy - 14}`}
            fill="var(--cp-dim)" opacity={0.35} />

          {/* Kaaba emoji at needle tip */}
          <text x={cx} y={cy - R + 24}
            textAnchor="middle" dominantBaseline="central"
            fontSize={15}>🕋</text>
        </g>

        {/* Centre pivot */}
        <circle cx={cx} cy={cy} r={5}
          fill="var(--cp-bg3, #1b2340)"
          stroke="var(--cp-acc)" strokeWidth={1.5} />
      </svg>

      {/* Bearing readout */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: T.mono, fontSize: 32, fontWeight: 700,
          color: T.ink, letterSpacing: '0.04em' }}>
          {Math.round(bearing)}°
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 11, color: T.dim,
          letterSpacing: '0.12em', marginTop: 2 }}>
          TOWARD MECCA
        </div>
      </div>

      {/* Status */}
      {permissionNeeded ? (
        <div style={{ textAlign: 'center', cursor: 'pointer' }} onClick={onRequestPermission}>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: 'var(--cp-acc)',
            letterSpacing: '0.12em', border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.35)',
            borderRadius: 6, padding: '6px 14px' }}>
            TAP COMPASS TO ENABLE (iOS)
          </div>
        </div>
      ) : live ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%',
            background: T.green, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontFamily: T.mono, fontSize: 9,
            color: T.green, letterSpacing: '0.12em' }}>LIVE COMPASS ACTIVE</span>
        </div>
      ) : (
        <div style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.25)',
          borderRadius: 6, padding: '8px 16px', textAlign: 'center' }}>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.orange,
            letterSpacing: '0.12em', marginBottom: 4 }}>
            COMPASS SENSOR UNAVAILABLE
          </div>
          <div style={{ fontFamily: T.sans, fontSize: 11, color: T.dim, lineHeight: 1.5 }}>
            Face <strong style={{ color: T.ink }}>{Math.round(bearing)}°</strong> to face the Qiblat
          </div>
        </div>
      )}
    </div>
  )
}
