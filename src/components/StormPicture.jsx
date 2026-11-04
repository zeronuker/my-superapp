import { useEffect, useRef, useState } from 'react'
import Collapse from './Collapse'
import { usePresence } from '../useTransitionAnim'
import { formatSnapshotStamp } from '../utils/savedBriefings'
import { ALERT_COLOR, compass } from '../utils/cyclones'

const mono = 'var(--cb-font-mono)'

const pos = ([lng, lat]) => `${Math.abs(lat).toFixed(1)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lng).toFixed(1)}°${lng < 0 ? 'W' : 'E'}`
const advisory = (s) => formatSnapshotStamp(s.advisory ? Date.parse(`${s.advisory}Z`) : s.updatedMs)
const color = s => ALERT_COLOR[s.alert] ?? ALERT_COLOR.Green
const KIND = { dep: 'DEP', arr: 'ARR', alt: 'ALT', era: 'ENROUTE ALT' }

// One label and its value, in the detail card's rows.
const Line = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 10 }}>
    <span style={{ color: 'var(--cp-dim)', minWidth: 96, flexShrink: 0, fontSize: 9, letterSpacing: '0.1em', paddingTop: 1 }}>{label}</span>
    <span style={{ color: 'var(--cp-txt)', minWidth: 0 }}>{children}</span>
  </div>
)

// What a storm's row shows once it is opened: strength, movement, where and when it started, how close it comes to the
// route, the airports of the briefing it reaches, and the forecast points.
function StormDetails({ s, snap }) {
  const m = s.movement
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--cp-border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {s.strength && <Line label="STRENGTH">{s.strength}</Line>}
      <Line label="MOVEMENT">{m ? `${compass(m.headingDeg)} (${m.headingDeg}°) AT ${m.speedKt} KT` : 'NOT AVAILABLE'}</Line>
      {s.country && <Line label="COUNTRIES">{s.country}</Line>}
      {s.startMs && <Line label="STARTED">{formatSnapshotStamp(s.startMs)} · UPDATED {advisory(s)}</Line>}
      {s.closest && (
        <Line label="CLOSEST TO ROUTE">{s.closest.routeNm.toLocaleString('en-US')} NM, STORM CENTRE AT {s.closest.label === 'NOW' ? 'THE ADVISORY TIME' : s.closest.label}</Line>
      )}
      {snap.airportsChecked > 0 && (
        <Line label="AIRPORTS AT RISK">
          {s.airports.length === 0
            ? 'NONE OF THE BRIEFING’S AIRPORTS: NOT IN ITS WIND AREAS OR CONE, AND NOT WITHIN 150 NM OF ITS CENTRE OR FORECAST TRACK'
            : s.airports.map(a => (
              <div key={a.icao}>
                <b>{a.icao}</b> ({KIND[a.kind] ?? a.kind.toUpperCase()}) · {[
                  a.bandKmh ? `IN THE ${a.bandKmh} KM/H WIND AREA` : null,
                  a.inCone ? 'IN THE CONE' : null,
                  `${a.trackNm} NM FROM THE TRACK`,
                ].filter(Boolean).join(' · ')}
              </div>
            ))}
        </Line>
      )}
      {s.rows.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ color: 'var(--cp-dim)', fontSize: 9, letterSpacing: '0.1em', marginBottom: 3 }}>FORECAST CENTRE (UTC){s.closest ? ' · DISTANCE FROM ROUTE' : ''}</div>
          {s.rows.map(r => (
            <div key={r.label} style={{ display: 'flex', gap: 10, color: r === s.closest ? 'var(--cp-acc)' : 'var(--cp-txt)' }}>
              <span style={{ minWidth: 72 }}>{r.label}</span>
              <span style={{ flex: 1 }}>{pos(r.position)}</span>
              {r.routeNm != null && <span>{r.routeNm.toLocaleString('en-US')} NM</span>}
            </div>
          ))}
        </div>
      )}
      {s.reportUrl && (
        <a href={s.reportUrl} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--cp-acc)', fontSize: 10, letterSpacing: '0.1em', marginTop: 4, width: 'fit-content' }}>GDACS REPORT ↗</a>
      )}
    </div>
  )
}

// The small card opened by tapping a storm on the map: the basics, a way to the full details, and a close button.
function MapCard({ s, onClose, onFull, closing }) {
  const [x, y] = [s.at[0] * 100, s.at[1] * 100]
  return (
    <div role="dialog" aria-label={`${s.name} details`} className={`cp-pop-in${closing ? ' is-closing' : ''}`} onClick={e => e.stopPropagation()} style={{
      position: 'absolute', zIndex: 2, width: 232, maxWidth: '80%', boxSizing: 'border-box',
      left: `clamp(6px, calc(${x}% - 116px), calc(100% - 238px))`,
      ...(y > 55 ? { bottom: `calc(${100 - y}% + 22px)` } : { top: `calc(${y}% + 22px)` }),
      background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)', borderLeft: `3px solid ${color(s)}`, borderRadius: 6,
      padding: '8px 10px', fontFamily: mono, fontSize: 11, lineHeight: 1.6, boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ color: 'var(--cp-txt)', fontWeight: 700, letterSpacing: '0.08em' }}>{s.name}{s.windKt ? ` · ${s.windKt} KT` : ''}</span>
        <button onClick={onClose} aria-label="CLOSE" className="cp-btn" style={{ padding: '0 7px', fontSize: 12, lineHeight: '18px', flexShrink: 0 }}>✕</button>
      </div>
      <div style={{ color: 'var(--cp-dim)' }}>{s.alert.toUpperCase()} ALERT · {pos(s.position)}</div>
      {s.distance && <div style={{ color: 'var(--cp-txt)' }}>CENTRE {s.distance.nowNm} NM FROM ROUTE</div>}
      <button onClick={onFull} style={{ background: 'none', border: 'none', padding: 0, marginTop: 2, cursor: 'pointer', fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: 'var(--cp-acc)', textDecoration: 'underline' }}>FULL DETAILS</button>
    </div>
  )
}

// The storms picture and, under it, one line per storm: how strong, where, how recent, how close to the route.
// Tap a storm on the picture for a small card, or its line for everything we know (the line opens and closes, one at a time).
// `snap` is what buildStormSnapshot returns.
export default function StormPicture({ snap }) {
  const [card, setCard] = useState(null)       // storm id whose small card is open on the map
  const [open, setOpen] = useState(null)       // storm id whose line is open
  const rows = useRef({})

  useEffect(() => { setCard(null); setOpen(null) }, [snap])
  useEffect(() => { if (open) rows.current[open]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [open])

  const shown = snap.storms.find(s => s.id === card)
  const lastShown = useRef(null)           // keeps the card on screen while it fades out
  if (shown) lastShown.current = shown
  const cardPresence = usePresence(!!shown)
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <img src={snap.image} alt="Tropical cyclones near the route" onClick={() => setCard(null)} style={{
          display: 'block', width: '100%', height: 'auto', borderRadius: 6, border: '1px solid var(--cp-border)',
        }} />
        {snap.storms.map(s => (
          <button key={s.id} aria-label={`${s.name} details`} onClick={e => { e.stopPropagation(); setCard(card === s.id ? null : s.id) }} style={{
            position: 'absolute', left: `${s.at[0] * 100}%`, top: `${s.at[1] * 100}%`, width: 38, height: 38, transform: 'translate(-50%, -50%)',
            padding: 0, border: 'none', borderRadius: '50%', background: 'transparent', cursor: 'pointer',
          }} />
        ))}
        {cardPresence.mounted && lastShown.current && (
          <MapCard s={lastShown.current} closing={cardPresence.closing} onClose={() => setCard(null)}
            onFull={() => { setOpen(lastShown.current.id); setCard(null) }} />
        )}
      </div>

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!snap.ok && <div style={{ fontFamily: mono, fontSize: 11, color: 'var(--cp-yellow)' }}>CYCLONE DATA UNAVAILABLE RIGHT NOW. THE MAP SHOWS NO STORMS.</div>}
        {snap.ok && snap.storms.length === 0 && (
          <div style={{ fontFamily: mono, fontSize: 11, color: 'var(--cp-dim)' }}>NO ACTIVE TROPICAL CYCLONES IN THIS AREA ({formatSnapshotStamp(snap.takenAt)}).</div>
        )}
        {snap.storms.map(s => (
          <div key={s.id} ref={el => { rows.current[s.id] = el }} style={{
            border: '1px solid var(--cp-border)', borderLeft: `3px solid ${color(s)}`,
            borderRadius: 4, padding: '8px 12px', fontFamily: mono, fontSize: 11, letterSpacing: '0.04em', lineHeight: 1.6,
          }}>
            <button onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id} style={{
              display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', letterSpacing: 'inherit', lineHeight: 'inherit',
            }}>
              <div style={{ color: 'var(--cp-txt)', fontWeight: 700, letterSpacing: '0.08em', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>
                  {s.name}{s.windKt ? ` · ${s.windKt} KT` : ''}
                  <span style={{ color: 'var(--cp-dim)', fontWeight: 400 }}> · {s.alert.toUpperCase()} ALERT · {s.source}</span>
                </span>
                <span aria-hidden="true" style={{ color: 'var(--cp-dim)' }}>{open === s.id ? '▾' : '▸'}</span>
              </div>
              <div style={{ color: 'var(--cp-dim)' }}>
                {pos(s.position)} · ADVISORY {advisory(s)}
              </div>
              {s.distance && (
                <div style={{ color: 'var(--cp-txt)' }}>
                  CENTRE {s.distance.nowNm} NM FROM ROUTE · FORECAST TRACK OR CONE COMES WITHIN {s.distance.forecastNm} NM
                </div>
              )}
            </button>
            <Collapse open={open === s.id}><StormDetails s={s} snap={snap} /></Collapse>
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
