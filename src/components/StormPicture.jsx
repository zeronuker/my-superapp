import { formatSnapshotStamp } from '../utils/savedBriefings'
import { ALERT_COLOR } from '../utils/cyclones'

const mono = 'var(--cb-font-mono)'

const pos = ([lng, lat]) => `${Math.abs(lat).toFixed(1)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lng).toFixed(1)}°${lng < 0 ? 'W' : 'E'}`
const advisory = (s) => formatSnapshotStamp(s.advisory ? Date.parse(`${s.advisory}Z`) : s.updatedMs)

// The storms picture and, under it, one line per storm: how strong, where, how recent, how close to the route.
// `snap` is what buildStormSnapshot returns (and what a saved briefing keeps as stormSnapshot).
export default function StormPicture({ snap }) {
  return (
    <div>
      <img src={snap.image} alt="Tropical cyclones near the route" style={{
        display: 'block', width: '100%', height: 'auto', borderRadius: 6, border: '1px solid var(--cp-border)',
      }} />

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!snap.ok && <div style={{ fontFamily: mono, fontSize: 11, color: 'var(--cp-yellow)' }}>CYCLONE DATA UNAVAILABLE RIGHT NOW. THE MAP SHOWS NO STORMS.</div>}
        {snap.ok && snap.storms.length === 0 && (
          <div style={{ fontFamily: mono, fontSize: 11, color: 'var(--cp-dim)' }}>NO ACTIVE TROPICAL CYCLONES IN THIS AREA ({formatSnapshotStamp(snap.takenAt)}).</div>
        )}
        {snap.storms.map(s => (
          <div key={s.id} style={{
            border: '1px solid var(--cp-border)', borderLeft: `3px solid ${ALERT_COLOR[s.alert] ?? ALERT_COLOR.Green}`,
            borderRadius: 4, padding: '8px 12px', fontFamily: mono, fontSize: 11, letterSpacing: '0.04em', lineHeight: 1.6,
          }}>
            <div style={{ color: 'var(--cp-txt)', fontWeight: 700, letterSpacing: '0.08em' }}>
              {s.name}{s.windKt ? ` · ${s.windKt} KT` : ''}
              <span style={{ color: 'var(--cp-dim)', fontWeight: 400 }}> · {s.alert.toUpperCase()} ALERT · {s.source}</span>
            </div>
            <div style={{ color: 'var(--cp-dim)' }}>
              {pos(s.position)} · ADVISORY {advisory(s)}
            </div>
            {s.distance && (
              <div style={{ color: 'var(--cp-txt)' }}>
                CENTRE {s.distance.nowNm} NM FROM ROUTE · FORECAST TRACK OR CONE COMES WITHIN {s.distance.forecastNm} NM
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', color: 'var(--cp-dim)', marginTop: 8, lineHeight: 1.6 }}>
        TROPICAL CYCLONES FROM GDACS (UN / EUROPEAN COMMISSION), WITH JTWC DATA. THE COLOURED BAND SHOWS WHERE WINDS REACH 60 (GREEN), 90 (ORANGE) AND
        120 (RED) KM/H ALONG THE STORM'S TRACK, PAST AND FORECAST. THE DASHED CONE SHOWS WHERE THE CENTRE MAY GO, NOT HOW BIG THE STORM IS.
        SOLID LINE: TRACK SO FAR; DASHED: FORECAST. ADVISORY-GRADE POSITIONS FOR AWARENESS. NOT FOR OPERATIONAL USE.
      </div>
    </div>
  )
}
