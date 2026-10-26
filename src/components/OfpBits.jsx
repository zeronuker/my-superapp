import { utcParts, localParts } from '../utils/ofpTimes'
import { getRoleStyle } from '../utils/metarSeverity'

// Shared by the Briefing tab's imported-OFP card and the Flight Details tab.

export function Field({ label, value, sub, flex = 1 }) {
  return (
    <div style={{ flex, minWidth: 0 }}>
      <div className="cp-label" style={{ margin: '0 0 3px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 14, letterSpacing: '0.04em' }}>{value ?? '—'}</div>
      {sub && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginTop: 2, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{sub}</div>}
    </div>
  )
}

// STD or STA: the UTC time and date, then the local time (with offset) and date at that airport.
export function TimeCol({ label, iso, tz, align }) {
  const u = iso && utcParts(iso)
  const l = iso && localParts(iso, tz)
  const small = { fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.06em' }
  return (
    <div style={{ textAlign: align }}>
      <div className="cp-label" style={{ margin: 0 }}>{label}</div>
      <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 16 }}>{u ? u.time : '—'}</div>
      {u && <div style={small}>{u.date} · UTC</div>}
      {l && (
        <>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, marginTop: 8 }}>{l.time} {l.offset}</div>
          <div style={small}>{l.date} · LOCAL</div>
        </>
      )}
    </div>
  )
}

// An airport chip in the colour the weather cards and the map give its role
// (destination alternate 1/2, enroute alternate 1…5). `role` null = the FIR colour.
export function Chip({ code, role }) {
  const s = role ? getRoleStyle(role) : null
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', marginRight: 6, borderRadius: 4,
      border: `1px solid ${s ? s.borderLatest : 'var(--cp-fir)'}`, color: s ? s.color : 'var(--cp-fir)',
      background: s ? s.bgLatest : 'transparent', fontFamily: 'var(--cb-font-mono)', fontSize: 12,
    }}>{code}</span>
  )
}
