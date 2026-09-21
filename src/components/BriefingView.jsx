import React, { useEffect, useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { fetchWeather } from '../services/weatherAPI'
import { fetchNotams, detectRouteFirs, NOTAM_CATEGORIES } from '../services/notamAPI'
import { fetchAllSigmets } from '../services/sigmetAPI'
import { syncModuleCaches } from '../services/briefingSync'
import { icaoToFir } from '../data/firLookup'
import { lookupAirport } from '../data/airports'
import {
  CAT_COLORS, WIND_COLORS,
  getMetarFlightCat, getWindSev, tokenizeRaw, parseTafSegments,
  getRoleStyle,
} from '../utils/metarSeverity'
import { filterSigmetsByFir } from '../utils/sigmet'
import { autoBriefingName, findOldest, isAtCap } from '../utils/savedBriefings'
import { BRIEFING_SAVES_CAP } from '../store/calculatorStore'
import SigmetCard from './SigmetCard'
import RadarSweepLoader, { computeAnimDuration } from './RadarSweepLoader'
import WindyRouteMap, { hasWindyLoadedBefore } from './WindyRouteMap'
import CartoRouteMap, { hasCartoLoadedBefore } from './CartoRouteMap'

// One fixed color per section (independent of the user's accent theme, same
// precedent as ROLE_COLORS in metarSeverity.js) so each section of the
// briefing reads as its own block at a glance. Hues are spread ~50-70°
// apart for real contrast (the original blue/violet pair sat only ~30°
// apart and read as near-identical) and avoid green/red/yellow, which
// METAR severity already claims inside the airport cards.
const SECTION_COLORS = {
  depArr:  '#2563EB', // blue
  destAlt: '#9333EA', // purple
  era:     '#0D9488', // teal
  notam:   '#D97706', // orange
  sigmet:  '#DB2777', // pink
}

// One section of the briefing — colored title + divider, and a faint tint
// over the whole block so sections stay visually distinct while scrolling.
function Section({ title, color, children }) {
  return (
    <div style={{
      marginBottom: 20, padding: '14px 16px 16px', borderRadius: 10,
      background: `color-mix(in srgb, ${color} 6%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
    }}>
      <div className="cp-section-header">
        <span className="cp-section-title" style={{ color }}>{title}</span>
        <div className="cp-divider" style={{ background: `color-mix(in srgb, ${color} 35%, transparent)` }} />
      </div>
      {children}
    </div>
  )
}

// Top-level sections (METAR/TAF, NOTAMs, SIGMETs) as tabs instead of one
// long stacked scroll. Styled as folder tabs (eLogbook's tab bar) rather
// than the calculator's gradient-topbar .cp-tab style: the active tab's
// own -1px bottom margin bleeds over the row's divider line instead of
// just hiding its own border, which is what a border-only fix can't do —
// the row's divider is a separate element sitting right where the active
// tab ends, so removing the tab's own border still leaves that line exposed.
const BRIEFING_TABS = [
  { id: 'metar', label: 'METAR/TAF' },
  { id: 'notam', label: 'NOTAMs' },
  { id: 'sigmet', label: 'SIGMETs' },
]

function BriefingTabBar({ active, onSelect, counts }) {
  return (
    <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', borderBottom: '1px solid var(--cp-border2)', marginBottom: 16 }}>
        {BRIEFING_TABS.map(tab => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
                padding: '7px 16px', borderRadius: '5px 5px 0 0', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                background: isActive ? 'var(--cp-bg)' : 'transparent',
                borderTop: isActive ? '2px solid var(--cp-acc)' : '1px solid var(--cp-border2)',
                borderLeft: '1px solid var(--cp-border2)',
                borderRight: '1px solid var(--cp-border2)',
                borderBottom: isActive ? '1px solid var(--cp-bg)' : '1px solid var(--cp-border2)',
                color: isActive ? 'var(--cp-acc)' : 'var(--cp-dim)',
                marginBottom: isActive ? -1 : 0,
              }}
            >
              {tab.label}
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                background: isActive ? 'var(--cp-bg2)' : 'var(--cp-bg3)',
                color: isActive ? 'var(--cp-txt)' : 'var(--cp-dim)',
              }}>{counts[tab.id]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Airports/taxiways/obstacles/navaids are what a pilot scans a NOTAM list
// for first — routine admin notices can wait for the full NOTAM tab.
const NOTAM_PRIORITY = { AERODROME: 0, OBSTACLE: 1, NAVAID: 2 }
const NOTAM_CAP = 5
// Rough chars-to-5-lines estimate at this card's font/width — see the
// "no DOM measurement available" note where it's used.
const NOTAM_TEXT_CLAMP_CHARS = 260
// METAR/TAF history depth Briefing fetches with — also recorded as the
// synced METAR/TAF cache's `hours`, so it accurately reflects what was
// actually fetched rather than claiming a wider window than it has.
const BRIEFING_METAR_HOURS = 2

// ── Build the same ordered, deduped airport list every module builds ──
// `key` (dep/arr/alt1/alt2/eraN) matches METARTAFCalculator's own target
// keys — needed to write results back into its cache shape (briefingSync).
function buildAirportTargets(dep, arr, destAlts, enrouteCount, enrouteAlts) {
  const list = []
  const add = (key, icao, label) => {
    if (!icao || typeof icao !== 'string') return
    if (icao.trim().length >= 3) list.push({ key, icao: icao.trim().toUpperCase(), label })
  }
  add('dep', dep, 'DEPARTURE')
  add('arr', arr, 'ARRIVAL')
  add('alt1', destAlts?.alt1, 'DESTINATION ALTERNATE 1')
  add('alt2', destAlts?.alt2, 'DESTINATION ALTERNATE 2')
  for (let i = 0; i < enrouteCount; i++) add(`era${i + 1}`, enrouteAlts?.[i], `ENROUTE ALTERNATE ${i + 1}`)
  const seen = new Set()
  return list.filter(t => { if (seen.has(t.icao)) return false; seen.add(t.icao); return true })
}

function getAirportCoords(icao) {
  const a = lookupAirport(icao)
  return a ? { lat: a.lat, lng: a.lng } : null
}

// Same auto-detect NOTAM/SIGMET already do (route great-circle + each
// airport's home FIR) — used only when the calling module has no FIR
// chips of its own (METAR/TAF has no FIR concept at all).
function autoDetectFirs(dep, arr, destAlts, enrouteCount, enrouteAlts) {
  const airports = [dep, arr, destAlts?.alt1, destAlts?.alt2, ...(enrouteAlts || []).slice(0, enrouteCount)]
    .map(x => (x || '').trim().toUpperCase()).filter(x => x.length >= 3)
  const found = []
  const seen = new Set()
  const push = (fir) => { if (fir && !seen.has(fir.icao)) { seen.add(fir.icao); found.push({ icao: fir.icao, name: fir.name }) } }
  for (const ap of airports) push(icaoToFir(ap))
  const depC = getAirportCoords(dep), arrC = getAirportCoords(arr)
  if (depC && arrC) for (const fir of detectRouteFirs(depC, arrC)) push(fir)
  return found
}

// Pausing (not discarding — see BriefingView) and jumping to the NOTAM tab
// for the full, untruncated list. Shared by AirportCard and FirNotamCard.
function useViewAllNotams() {
  const pauseBriefing = useCalculatorStore(s => s.pauseBriefing)
  const setActiveCalculator = useCalculatorStore(s => s.setActiveCalculator)
  return () => { pauseBriefing(); setActiveCalculator('notam') }
}

// Capped, prioritized, line-clamped NOTAM list — shared by AirportCard
// (per-airport) and FirNotamCard (per-FIR, e.g. airspace/oceanic notices).
function NotamListSection({ notams, onViewAll }) {
  const activeNotams = (notams || []).filter(n => n.validity.status === 'ACTIVE')
  const sortedNotams = [...activeNotams].sort((a, b) =>
    (NOTAM_PRIORITY[a.category] ?? 99) - (NOTAM_PRIORITY[b.category] ?? 99))
  const visibleNotams = sortedNotams.slice(0, NOTAM_CAP)
  const hiddenCount = sortedNotams.length - visibleNotams.length

  return (
    <div>
      <div className="cp-label" style={{ marginBottom: 3 }}>NOTAMS · {activeNotams.length} ACTIVE</div>
      {activeNotams.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--cp-dim)', fontStyle: 'italic' }}>No active NOTAMs</div>
      ) : (
        <div>
          {visibleNotams.map((n, i) => {
            // No DOM measurement available at render time — a character
            // count is a reasonable stand-in for "this will run past 5
            // lines at this card's width" without needing a ref/resize
            // observer for something this low-stakes.
            const likelyOverflows = (n.summary || '').length > NOTAM_TEXT_CLAMP_CHARS
            return (
              <div key={n.id} style={{
                fontSize: 11.5, lineHeight: 1.4, padding: '6px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--cp-border3)',
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                    background: NOTAM_CATEGORIES[n.category]?.color || 'var(--cp-dim)',
                  }} />
                  <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10.5, color: 'var(--cp-dim)', flexShrink: 0 }}>
                    {n.id}
                  </span>
                  <span style={{
                    color: 'var(--cp-muted)', display: '-webkit-box',
                    WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {n.summary}
                  </span>
                </div>
                {likelyOverflows && (
                  <button onClick={onViewAll} style={{
                    marginTop: 3, marginLeft: 14, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
                    fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-acc)',
                    textDecoration: 'underline', textUnderlineOffset: 2,
                  }}>
                    read full text in NOTAM tab →
                  </button>
                )}
              </div>
            )
          })}
          {hiddenCount > 0 && (
            <button onClick={onViewAll} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
              marginTop: 6, padding: '8px 10px', borderRadius: 5, cursor: 'pointer', textAlign: 'left',
              border: '1px dashed var(--cp-border)', background: 'var(--cp-bg3)',
              fontFamily: 'var(--cb-font-mono)', fontSize: 10.5, letterSpacing: '0.02em', color: 'var(--cp-acc)',
            }}>
              <span style={{ color: 'var(--cp-dim)' }}>
                <span style={{ color: 'var(--cp-acc)' }}>+ {hiddenCount} more</span> · runway/taxiway, obstacle &amp; navaid notices shown first
              </span>
              <span style={{ flexShrink: 0 }}>view all in NOTAM tab →</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── One FIR's NOTAMs — airspace/oceanic notices, not tied to any one airport ──
function FirNotamCard({ fir, notams }) {
  const viewAllNotams = useViewAllNotams()
  return (
    <div className="cp-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 9, padding: '10px 14px',
        borderBottom: '1px solid var(--cp-border3)', borderLeft: '3px solid var(--cp-acc)',
      }}>
        <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--cp-txt)' }}>
          {fir.icao}
        </span>
        {fir.name && (
          <span style={{ fontSize: 11, color: 'var(--cp-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fir.name}
          </span>
        )}
      </div>
      <div style={{ padding: '12px 14px 14px' }}>
        <NotamListSection notams={notams} onViewAll={viewAllNotams} />
      </div>
    </div>
  )
}

// ── One airport's NOTAMs, in the NOTAMs tab — same header treatment as
// AirportCard (role-colored, name), without the METAR/TAF fields ──
function AirportNotamCard({ target, notams }) {
  const role = getRoleStyle(target.label)
  const airport = lookupAirport(target.icao)
  const viewAllNotams = useViewAllNotams()

  return (
    <div className="cp-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 9, padding: '10px 14px',
        borderBottom: '1px solid var(--cp-border3)', borderLeft: `3px solid ${role.color}`,
      }}>
        <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--cp-txt)' }}>
          {target.icao}
        </span>
        <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: role.color, whiteSpace: 'nowrap' }}>
          {target.label}
        </span>
        {airport && (
          <span style={{ fontSize: 11, color: 'var(--cp-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {airport.name}
          </span>
        )}
      </div>
      <div style={{ padding: '12px 14px 14px' }}>
        <NotamListSection notams={notams} onViewAll={viewAllNotams} />
      </div>
    </div>
  )
}

// ── One airport's METAR/TAF summary, latest report only ──
function AirportCard({ target, weather }) {
  const role = getRoleStyle(target.label)
  const airport = lookupAirport(target.icao)
  const latestMetar = weather?.metar?.[0] || null
  const latestTaf = weather?.taf?.[0] || null
  const cat = getMetarFlightCat(latestMetar)
  const catColor = cat ? CAT_COLORS[cat] : role.color
  const windSev = getWindSev(latestMetar?.wspd, latestMetar?.wgst)
  const windColor = windSev !== 'NORMAL' ? WIND_COLORS[windSev] : null
  const metarTokens = latestMetar ? tokenizeRaw(latestMetar.rawOb, catColor, windColor) : null
  const tafSegments = latestTaf ? parseTafSegments(latestTaf.rawTAF) : null

  return (
    <div className="cp-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        padding: '10px 14px', borderBottom: '1px solid var(--cp-border3)', borderLeft: `3px solid ${role.color}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--cp-txt)' }}>
            {target.icao}
          </span>
          <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: role.color, whiteSpace: 'nowrap' }}>
            {target.label}
          </span>
          {airport && (
            <span style={{ fontSize: 11, color: 'var(--cp-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {airport.name}
            </span>
          )}
        </div>
        {cat && (
          <span style={{
            fontFamily: 'var(--cb-font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            padding: '3px 8px', borderRadius: 4, color: catColor, background: `${catColor}22`, flexShrink: 0,
          }}>
            {cat}
          </span>
        )}
      </div>

      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ marginBottom: 9 }}>
          <div className="cp-label" style={{ marginBottom: 3 }}>METAR</div>
          <div style={{
            fontFamily: 'var(--cb-font-mono)', fontSize: 11.5, lineHeight: 1.5,
            background: 'var(--cp-bg3)', borderRadius: 4, padding: '7px 9px', wordBreak: 'break-word',
          }}>
            {metarTokens
              ? metarTokens.map((t, i) => <span key={i} style={{ color: t.color }}>{t.text}</span>)
              : <span style={{ color: 'var(--cp-dim)' }}>No METAR data</span>}
          </div>
        </div>

        <div style={{ marginBottom: 9 }}>
          <div className="cp-label" style={{ marginBottom: 3 }}>TAF</div>
          <div style={{
            fontFamily: 'var(--cb-font-mono)', fontSize: 11.5, lineHeight: 1.5,
            background: 'var(--cp-bg3)', borderRadius: 4, padding: '7px 9px', wordBreak: 'break-word',
          }}>
            {tafSegments && tafSegments.length > 0
              ? tafSegments.map((seg, si) => (
                  <div key={si} style={{ opacity: seg.isTemporal ? 0.7 : 1, marginTop: si > 0 ? 3 : 0 }}>
                    {seg.tokens.map((t, i) => <span key={i} style={{ color: t.color }}>{t.text}</span>)}
                  </div>
                ))
              : <span style={{ color: 'var(--cp-dim)' }}>No TAF data</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Route map: CARTO vector basemap + role-colored airport dots ──
const BASEMAP_TABS = [
  { id: 'dark', label: 'Dark' },
  { id: 'live', label: 'Live Weather' },
]

function RouteMap({ dep, arr, destAltList, eraList, isOffline }) {
  const [tab, setTab] = useState('dark')
  const depAp = dep && lookupAirport(dep)
  const arrAp = arr && lookupAirport(arr)

  const markers = []
  if (depAp) markers.push({ icao: dep, label: 'DEPARTURE', lat: depAp.lat, lng: depAp.lng, big: true })
  if (arrAp) markers.push({ icao: arr, label: 'ARRIVAL', lat: arrAp.lat, lng: arrAp.lng, big: true })
  for (const a of destAltList) {
    const ap = lookupAirport(a.icao)
    if (ap) markers.push({ icao: a.icao, label: a.label, lat: ap.lat, lng: ap.lng })
  }
  for (const a of eraList) {
    const ap = lookupAirport(a.icao)
    if (ap) markers.push({ icao: a.icao, label: a.label, lat: ap.lat, lng: ap.lng })
  }
  if (markers.length === 0) return null

  return (
    <div style={{
      position: 'relative', border: '1px solid var(--cp-border3)', borderRadius: 10,
      overflow: 'hidden', marginBottom: 20, background: 'var(--cp-bg3)', boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', position: 'relative', zIndex: 2,
      }}>
        <div style={{
          fontFamily: 'var(--cb-font-mono)', fontSize: 10,
          letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--cp-dim)',
        }}>
          Route &amp; Alternates
        </div>
        <div style={{
          display: 'flex', gap: 2, background: 'var(--cp-bg)', border: '1px solid var(--cp-border3)',
          borderRadius: 7, padding: 2,
        }}>
          {BASEMAP_TABS.map(opt => {
            // Blocked only for a genuinely first-time load while offline —
            // once a basemap has loaded this session, it (and whatever
            // tiles were already fetched) stays cached, so switching back
            // to it offline still works.
            const hasLoadedBefore = opt.id === 'live' ? hasWindyLoadedBefore() : hasCartoLoadedBefore(opt.id)
            const blocked = isOffline && !hasLoadedBefore
            return (
              <button
                key={opt.id}
                onClick={() => !blocked && setTab(opt.id)}
                disabled={blocked}
                title={blocked ? 'Unavailable offline — never loaded this session' : undefined}
                style={{
                  fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase',
                  color: tab === opt.id ? 'var(--cp-txt)' : 'var(--cp-dim)',
                  background: tab === opt.id ? 'var(--cp-bg3)' : 'transparent',
                  border: 'none', borderRadius: 5, padding: '6px 10px',
                  cursor: blocked ? 'not-allowed' : 'pointer',
                  opacity: blocked ? 0.4 : 1,
                }}
              >{opt.label}</button>
            )
          })}
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10', maxHeight: 900 }}>
        {tab === 'live' ? (
          <WindyRouteMap markers={markers} isOffline={isOffline} />
        ) : (
          <CartoRouteMap markers={markers} styleKey={tab} isOffline={isOffline} />
        )}
      </div>
    </div>
  )
}

// ── Saved briefings dropdown — read-only browse/open/delete list ──
function SavedList({ saves, savedId, onOpen, onDelete }) {
  return (
    <div style={{
      position: 'absolute', top: 66, right: 60, width: 280, maxHeight: 360, overflowY: 'auto',
      background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)', borderRadius: 10,
      boxShadow: '0 16px 40px rgba(0,0,0,0.5)', zIndex: 10,
    }}>
      <div style={{
        padding: '9px 12px', fontFamily: 'var(--cb-font-mono)', fontSize: 9.5,
        letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cp-dim)',
        borderBottom: '1px solid var(--cp-border3)',
      }}>
        Saved Briefings · {saves.length}/{BRIEFING_SAVES_CAP}
      </div>
      {saves.length === 0 ? (
        <div style={{ padding: '14px 12px', fontSize: 11, color: 'var(--cp-dim)' }}>No saved briefings yet.</div>
      ) : (
        <div style={{ padding: 4 }}>
          {saves.map((b, i) => {
            const isOpen = b.id === savedId
            return (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', borderRadius: 6,
                borderLeft: isOpen ? '3px solid var(--cp-acc2)' : '3px solid transparent',
                background: isOpen ? 'var(--cp-bg3)' : 'transparent',
              }}>
                <button onClick={() => onOpen(b.id)} style={{
                  flex: '1 1 auto', minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--cp-txt)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{b.name}</span>
                    {i === 0 && (
                      <span style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--cp-acc)',
                        background: 'var(--cp-bg)', padding: '1px 5px', borderRadius: 4, flexShrink: 0,
                      }}>LATEST</span>
                    )}
                    {isOpen && (
                      <span style={{
                        fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--cp-acc2)',
                        background: 'var(--cp-bg)', padding: '1px 5px', borderRadius: 4, flexShrink: 0,
                      }}>ACTIVE</span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9, color: 'var(--cp-dim)', marginTop: 2 }}>
                    {b.route?.dep} → {b.route?.arr}
                  </div>
                </button>
                <button onClick={() => onDelete(b.id)} title="Delete" style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cp-dim)',
                  fontSize: 16, lineHeight: 1, padding: '0 4px', flexShrink: 0,
                }}>×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Shared small confirm-modal shell for the two briefing prompts below ──
function BriefingPromptModal({ onDismiss, children }) {
  return (
    <div onClick={onDismiss} style={{
      position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 380, background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)',
        borderRadius: 10, padding: 18,
      }}>
        {children}
      </div>
    </div>
  )
}

// ── Shown when saving would exceed BRIEFING_SAVES_CAP ──
function CapReachedPrompt({ oldest, cap, onConfirm, onCancel }) {
  return (
    <BriefingPromptModal onDismiss={onCancel}>
      <div style={{
        fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--cp-yellow)', marginBottom: 12,
      }}>
        Saved Briefings Full · {cap}/{cap}
      </div>
      <div style={{ fontSize: 12, color: 'var(--cp-txt)', lineHeight: 1.6, marginBottom: 14 }}>
        You've reached the {cap}-briefing limit. Delete the oldest saved briefing to make room for this one?
      </div>
      {oldest && (
        <div style={{
          fontSize: 11, color: 'var(--cp-dim)', background: 'var(--cp-bg3)', borderRadius: 6,
          padding: '8px 10px', marginBottom: 18,
        }}>
          {oldest.name} — oldest save
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCancel} className="cp-btn" style={{ fontSize: 11 }}>Cancel</button>
        <button onClick={onConfirm} style={{
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          padding: '8px 14px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
          border: '1px solid var(--cp-red)', background: 'rgba(239,68,68,0.12)', color: 'var(--cp-red)',
        }}>Delete Oldest &amp; Save</button>
      </div>
    </BriefingPromptModal>
  )
}

// ── Shown only when closing (✕/Escape/backdrop) a fresh, never-saved briefing ──
function SaveBeforeClosePrompt({ onSave, onDiscard, onCancel }) {
  return (
    <BriefingPromptModal onDismiss={onCancel}>
      <div style={{
        fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--cp-txt)', marginBottom: 10,
      }}>
        Save Before Closing?
      </div>
      <div style={{ fontSize: 12, color: 'var(--cp-dim)', lineHeight: 1.6, marginBottom: 18 }}>
        This briefing hasn't been saved. Save it now, or discard it?
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <button onClick={onDiscard} style={{
          fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.06em',
          padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
          border: '1px solid rgba(239,68,68,0.4)', background: 'transparent', color: 'var(--cp-red)',
        }}>Discard</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} className="cp-btn" style={{ fontSize: 11 }}>Cancel</button>
          <button onClick={onSave} style={{
            fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
            padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid var(--cp-acc)', background: 'var(--cp-accdim)', color: 'var(--cp-acc)',
          }}>Save</button>
        </div>
      </div>
    </BriefingPromptModal>
  )
}

export default function BriefingView() {
  const briefing = useCalculatorStore(s => s.briefing)
  const setBriefingData = useCalculatorStore(s => s.setBriefingData)
  const closeBriefing = useCalculatorStore(s => s.closeBriefing)
  const openSavedBriefing = useCalculatorStore(s => s.openSavedBriefing)
  const saveBriefing = useCalculatorStore(s => s.saveBriefing)
  const renameSavedBriefing = useCalculatorStore(s => s.renameSavedBriefing)
  const deleteSavedBriefing = useCalculatorStore(s => s.deleteSavedBriefing)
  const { route, data, savedId, saves } = briefing
  const isSaved = !!savedId
  const savedEntry = isSaved ? saves.find(b => b.id === savedId) : null
  // A fresh fetch that's never been saved — closing it prompts to save first;
  // an already-saved entry (or nothing fetched yet) just closes.
  const hasUnsaved = !isSaved && !!data

  const [targets] = useState(() => buildAirportTargets(route.dep, route.arr, route.destAlts, route.enrouteCount, route.enrouteAlts))
  const [loading, setLoading] = useState(!data)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)
  const [activeTab, setActiveTab] = useState('metar')
  const [savedListOpen, setSavedListOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(null)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [showCapPrompt, setShowCapPrompt] = useState(false)

  // Real close — ✕/Escape/backdrop. A fresh, unsaved fetch prompts to save
  // first; a saved entry (or an empty/still-loading session) just closes.
  const requestClose = () => {
    if (hasUnsaved) { setShowSavePrompt(true); return }
    closeBriefing()
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const on = () => setIsOffline(false)
    const off = () => setIsOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      // Escape while editing the title cancels the edit, not the whole overlay.
      if (editingTitle) { setEditingTitle(false); return }
      requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTitle, hasUnsaved])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // A resumed session (route already fetched once, just re-opened) skips
  // the fetch entirely and renders straight from the cached briefing data.
  useEffect(() => {
    if (data) return
    let cancelled = false
    let revealTimer = null
    async function run() {
      if (targets.length === 0) {
        setError('No airports entered.')
        setLoading(false)
        return
      }
      // Offline with nothing cached for this route (openBriefing already
      // reused a matching cache instead of getting here) — don't spin the
      // radar-sweep animation for a fetch that can only fail.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setError('You are offline and no cached briefing is available for this route. Connect to fetch one.')
        setLoading(false)
        return
      }
      const startedAt = Date.now()
      const resolvedFirs = (route.firs && route.firs.length)
        ? route.firs
        : autoDetectFirs(route.dep, route.arr, route.destAlts, route.enrouteCount, route.enrouteAlts)

      // NOTAMs for the airports AND the route FIRs (airspace/oceanic notices
      // — NOTAM/SIGMET's own auto-detect fetches these too, Briefing was
      // only ever fetching per-airport ones).
      const notamTargetIcaos = [...new Set([
        ...targets.map(t => t.icao),
        ...resolvedFirs.map(f => f.icao.toUpperCase()),
      ])]

      const [weatherList, notamResult, allSigmets] = await Promise.all([
        Promise.all(targets.map(async (t) => ({ ...t, ...(await fetchWeather(t.icao, BRIEFING_METAR_HOURS)) }))),
        fetchNotams(notamTargetIcaos),
        fetchAllSigmets(AbortSignal.timeout(15_000)).catch(() => []),
      ])
      if (cancelled) return

      const notamBySource = {}
      for (const n of notamResult.notams) (notamBySource[n.source] ??= []).push(n)

      const firIds = new Set(resolvedFirs.map(f => f.icao.toUpperCase()))
      const scopedSigmets = filterSigmetsByFir(allSigmets, firIds)
        .sort((a, b) => (a.validTo?.getTime() ?? Infinity) - (b.validTo?.getTime() ?? Infinity))

      const reveal = () => {
        setBriefingData({
          airports: weatherList,
          notamsByIcao: notamBySource,
          sigmets: scopedSigmets,
          firsUsed: resolvedFirs,
          fetchedAt: Date.now(),
        })
        // Push these same, already-fetched results into METAR/TAF, NOTAM
        // and SIGMET's own caches — no extra API calls — so opening one of
        // those tabs directly afterwards shows this route already loaded.
        syncModuleCaches({ route, weatherList, notamResult, resolvedFirs, scopedSigmets, hours: BRIEFING_METAR_HOURS })
        setLoading(false)
      }

      // Same rule as the other modules' fetch: let the radar-sweep animation
      // finish playing out before revealing results, so a fast response
      // doesn't cut it short.
      const remaining = computeAnimDuration(targets.length) - (Date.now() - startedAt)
      if (remaining > 0) revealTimer = setTimeout(reveal, remaining)
      else reveal()
    }
    run()
    return () => { cancelled = true; if (revealTimer) clearTimeout(revealTimer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const airports = data?.airports || []
  const notamsByIcao = data?.notamsByIcao || {}
  const sigmets = data?.sigmets || []
  const firsUsed = data?.firsUsed || []
  const fetchedAt = data?.fetchedAt || null

  const depArr = airports.filter(a => a.label === 'DEPARTURE' || a.label === 'ARRIVAL')
  const destAltList = airports.filter(a => a.label.startsWith('DESTINATION ALTERNATE'))
  const eraList = airports.filter(a => a.label.startsWith('ENROUTE ALTERNATE'))

  const activeNotamCount = (icaos) => icaos.reduce((sum, icao) =>
    sum + (notamsByIcao[icao] || []).filter(n => n.validity.status === 'ACTIVE').length, 0)
  const notamCount = activeNotamCount(airports.map(a => a.icao)) + activeNotamCount(firsUsed.map(f => f.icao))

  // Editable title: an explicit rename, else the current save's name, else a
  // live preview of the auto-generated name once there's data to name.
  const displayTitle = titleDraft ?? savedEntry?.name ?? (data ? autoBriefingName(route, fetchedAt || Date.now()) : '')

  const commitTitle = (value) => {
    const trimmed = (value || '').trim()
    setEditingTitle(false)
    if (!trimmed) return
    setTitleDraft(trimmed)
    // Already saved — renaming updates it immediately. Not yet saved — the
    // draft just becomes the name Save uses when it's eventually clicked.
    if (isSaved) renameSavedBriefing(savedId, trimmed)
  }

  const attemptSave = () => {
    if (!data) return
    if (isAtCap(saves, BRIEFING_SAVES_CAP)) { setShowCapPrompt(true); return }
    saveBriefing(titleDraft ?? undefined)
  }
  const handleDeleteOldestAndSave = () => {
    const oldest = findOldest(saves)
    if (oldest) deleteSavedBriefing(oldest.id)
    saveBriefing(titleDraft ?? undefined)
    setShowCapPrompt(false)
  }
  const handleSaveThenClose = () => {
    setShowSavePrompt(false)
    if (isAtCap(saves, BRIEFING_SAVES_CAP)) { setShowCapPrompt(true); return }
    saveBriefing(titleDraft ?? undefined)
    closeBriefing()
  }
  const handleDiscardAndClose = () => { setShowSavePrompt(false); closeBriefing() }

  return (
    <>
    <div
      onClick={requestClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 980, background: 'var(--cp-bg)', borderRadius: 12,
          border: '1px solid var(--cp-border)', boxShadow: '0 24px 60px rgba(0,0,0,0.4)', overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '12px 18px', background: 'var(--cp-bg2)', borderBottom: '1px solid var(--cp-border3)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 9.5, fontWeight: 700,
              letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--cp-dim)' }}>
              ✈ Flight Briefing
            </div>
            {editingTitle ? (
              <input
                autoFocus
                defaultValue={displayTitle}
                onBlur={e => commitTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                className="cp-input"
                style={{
                  marginTop: 4, fontSize: 15, fontWeight: 600, padding: '4px 8px',
                  maxWidth: 420,
                }}
              />
            ) : displayTitle && (
              <button
                onClick={() => setEditingTitle(true)}
                title="Rename"
                style={{
                  marginTop: 4, display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0, maxWidth: '100%',
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--cp-txt)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayTitle}</span>
                <span style={{ color: 'var(--cp-dim)', fontSize: 12, flexShrink: 0 }}>✎</span>
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 2 }}>
            {!isSaved && data && (
              <button onClick={attemptSave} className="cp-btn" style={{ fontSize: 10, letterSpacing: '0.1em' }}>
                SAVE
              </button>
            )}
            <button
              onClick={() => setSavedListOpen(v => !v)}
              className="cp-btn"
              style={{
                fontSize: 10, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 6,
                color: savedListOpen ? 'var(--cp-acc)' : undefined, borderColor: savedListOpen ? 'var(--cp-acc)' : undefined,
              }}
            >
              SAVED
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                background: 'var(--cp-bg3)', color: 'var(--cp-txt)',
              }}>{saves.length}</span>
            </button>
            <button onClick={requestClose} className="cp-btn" style={{ width: 28, height: 28, padding: 0 }}>✕</button>
          </div>
        </div>

        {savedListOpen && (
          <SavedList
            saves={saves}
            savedId={savedId}
            onOpen={(id) => { openSavedBriefing(id); setSavedListOpen(false) }}
            onDelete={(id) => deleteSavedBriefing(id)}
          />
        )}

        <div style={{ padding: '18px 20px 24px' }}>
          {loading ? (
            <RadarSweepLoader targets={targets.map(t => t.icao)} />
          ) : error ? (
            <div style={{ color: 'var(--cp-red)', fontFamily: 'var(--cb-font-mono)', fontSize: 12,
              letterSpacing: '0.08em', padding: '20px 0' }}>
              ERROR · {error}
            </div>
          ) : (
            <>
              {isOffline && (
                <div style={{
                  background: 'rgba(252,211,77,0.07)', border: '1px solid rgba(252,211,77,0.25)',
                  borderLeft: '3px solid var(--cp-yellow)', borderRadius: 4, padding: '8px 14px', marginBottom: 12,
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: 'var(--cb-font-mono)', fontSize: 11, letterSpacing: '0.12em', color: 'var(--cp-yellow)',
                }}>
                  ⚠ OFFLINE <span style={{ color: 'var(--cp-dim)' }}>· SHOWING CACHED DATA</span>
                </div>
              )}

              <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)',
                letterSpacing: '0.08em', marginBottom: 14 }}>
                {route.dep && route.arr ? `${route.dep} → ${route.arr}` : route.dep || route.arr}
                {fetchedAt && ` · FETCHED ${new Date(fetchedAt).toUTCString().toUpperCase()}`}
              </div>

              <RouteMap dep={route.dep} arr={route.arr} destAltList={destAltList} eraList={eraList} isOffline={isOffline} />

              <BriefingTabBar
                active={activeTab}
                onSelect={setActiveTab}
                counts={{ metar: airports.length, notam: notamCount, sigmet: sigmets.length }}
              />

              {activeTab === 'metar' && (
                <>
                  {/* ── Departure / Arrival ── */}
                  {depArr.length > 0 && (
                    <Section title="Departure & Arrival" color={SECTION_COLORS.depArr}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                        {depArr.map(a => <AirportCard key={a.icao} target={a} weather={a} />)}
                      </div>
                    </Section>
                  )}

                  {/* ── Destination Alternates ── */}
                  {destAltList.length > 0 && (
                    <Section title="Destination Alternates" color={SECTION_COLORS.destAlt}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                        {destAltList.map(a => <AirportCard key={a.icao} target={a} weather={a} />)}
                      </div>
                    </Section>
                  )}

                  {/* ── Enroute Alternates ── */}
                  {eraList.length > 0 && (
                    <Section title="Enroute Alternates" color={SECTION_COLORS.era}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                        {eraList.map(a => <AirportCard key={a.icao} target={a} weather={a} />)}
                      </div>
                    </Section>
                  )}
                </>
              )}

              {/* ── NOTAMs — per-airport, then per route FIR (airspace/oceanic notices) ── */}
              {activeTab === 'notam' && (
                <>
                  {airports.length > 0 && (
                    <Section title="Notams — Airports" color={SECTION_COLORS.notam}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                        {airports.map(a => <AirportNotamCard key={a.icao} target={a} notams={notamsByIcao[a.icao]} />)}
                      </div>
                    </Section>
                  )}

                  <Section title="Notams — Route Firs" color={SECTION_COLORS.notam}>
                    {firsUsed.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--cp-dim)' }}>No FIRs could be determined from this route.</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                        {firsUsed.map(fir => <FirNotamCard key={fir.icao} fir={fir} notams={notamsByIcao[fir.icao]} />)}
                      </div>
                    )}
                  </Section>
                </>
              )}

              {/* ── SIGMETs ── */}
              {activeTab === 'sigmet' && (
                <Section title="Sigmets — Route Firs" color={SECTION_COLORS.sigmet}>
                  {firsUsed.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--cp-dim)' }}>No FIRs could be determined from this route.</div>
                  ) : sigmets.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--cp-dim)' }}>
                      No active SIGMETs for {firsUsed.map(f => f.icao).join(', ')}.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sigmets.map((s, i) => <SigmetCard key={i} s={s} now={now} />)}
                    </div>
                  )}
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>

    {showCapPrompt && (
      <CapReachedPrompt
        oldest={findOldest(saves)}
        cap={BRIEFING_SAVES_CAP}
        onConfirm={handleDeleteOldestAndSave}
        onCancel={() => setShowCapPrompt(false)}
      />
    )}
    {showSavePrompt && (
      <SaveBeforeClosePrompt
        onSave={handleSaveThenClose}
        onDiscard={handleDiscardAndClose}
        onCancel={() => setShowSavePrompt(false)}
      />
    )}
    </>
  )
}
