import { formatSnapshotStamp } from '../utils/savedBriefings'

const mono = 'var(--cb-font-mono)'

// A winds-aloft picture with the line under it: when it was made and what it shows.
// `snap` is what buildWindSnapshot returns (and what a saved briefing keeps as windSnapshot).
export default function WindPicture({ snap }) {
  const at = ms => formatSnapshotStamp(ms)
  return (
    <div>
      <img src={snap.image} alt={`Winds aloft picture at FL${snap.fl}`} style={{
        display: 'block', width: '100%', height: 'auto', borderRadius: 6, border: '1px solid var(--cp-border)',
      }} />
      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', color: 'var(--cp-dim)', marginTop: 8, lineHeight: 1.6 }}>
        WINDS AT FL{snap.fl} ({snap.hpa} hPa) · NOAA GFS FORECAST RUN {at(snap.runMs)} · VALID {at(snap.validMs)} · MADE {at(snap.takenAt)}.
        BARBS SHOW THE DIRECTION THE WIND BLOWS FROM (HALF BARB 5 KT, FULL 10, PENNANT 50). A MODEL FORECAST, NOT AN OBSERVATION.
        NOT FOR OPERATIONAL USE.
      </div>
    </div>
  )
}
