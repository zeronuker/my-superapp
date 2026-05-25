import { T } from './tokens'

export default function PrayerRow({ name, time, done, isNext, isSunrise }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0',
      background: isNext ? 'rgba(var(--cp-acc-rgb,63,224,197),0.05)' : 'transparent',
      borderLeft: isNext ? '3px solid var(--cp-acc)' : '3px solid transparent',
      paddingLeft: isNext ? 10 : 0,
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isNext && (
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cp-acc)', flexShrink: 0 }} />
        )}
        <span style={{
          fontFamily: T.sans, fontSize: 14,
          fontWeight: isNext ? 600 : 400,
          color: done && !isNext ? T.dim : isNext ? 'var(--cp-acc)' : T.ink,
          opacity: isSunrise ? 0.5 : 1,
        }}>
          {name}
        </span>
        {isSunrise && (
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dim, letterSpacing: '0.1em' }}>
            SUNRISE
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontFamily: T.mono, fontSize: 14, fontWeight: 700,
          color: done && !isNext ? T.dim : isNext ? 'var(--cp-acc)' : T.ink2,
        }}>
          {time}
        </span>
        {done && <span style={{ fontSize: 10, color: T.dim }}>✓</span>}
      </div>
    </div>
  )
}
