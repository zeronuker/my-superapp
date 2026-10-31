import { formatSnapshotStamp } from '../utils/savedBriefings'

const mono = 'var(--cb-font-mono)'

// The grey box shown where a picture goes while it loads or when there is none.
export function PictureNote({ children }) {
  return (
    <div style={{
      fontFamily: mono, fontSize: 11, letterSpacing: '0.1em', color: 'var(--cp-dim)', textAlign: 'center',
      padding: '48px 16px', border: '1px solid var(--cp-border)', borderRadius: 6,
    }}>{children}</div>
  )
}

// A satellite picture with the line under it: when it was taken and what it shows.
// `snap` is what buildSatSnapshot returns (and what a saved briefing keeps as satSnapshot).
export default function SatPicture({ snap }) {
  const times = snap.sats.filter(s => s.time).map(s => `${s.label} ${new Date(s.time).toISOString().slice(11, 16)}Z`).join(' · ')
  return (
    <div>
      <img src={snap.image} alt="Satellite cloud picture of the route" style={{
        display: 'block', width: '100%', height: 'auto', borderRadius: 6, border: '1px solid var(--cp-border)',
      }} />
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', color: 'var(--cp-dim)', marginTop: 8, lineHeight: 1.6 }}>
        INFRARED CLOUD PICTURE · IMAGE TIMES {times || '—'} · TAKEN {formatSnapshotStamp(snap.takenAt)} · {snap.credits.join(' · ').toUpperCase()}.
        A SNAPSHOT OF THE SKY AT THAT TIME, NOT A FORECAST. NOT FOR OPERATIONAL USE.
      </div>
    </div>
  )
}
