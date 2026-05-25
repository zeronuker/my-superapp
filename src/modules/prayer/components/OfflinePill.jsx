import { T } from './tokens'

export default function OfflinePill({ source }) {
  if (source !== 'local') return null
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'rgba(251,146,60,0.1)',
      border: '1px solid rgba(251,146,60,0.3)',
      borderRadius: 20, padding: '3px 10px',
      margin: '8px 0',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%',
        background: T.orange, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ fontFamily: T.mono, fontSize: 9,
        letterSpacing: '0.12em', color: T.orange }}>
        CALCULATED OFFLINE
      </span>
    </div>
  )
}
