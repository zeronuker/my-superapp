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
import { interpolateGreatCircle } from '../modules/prayer/services/flightCalc'
import { projectLatLng, WORLD_LAND_PATH, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT } from '../data/worldMap'
import SigmetCard from './SigmetCard'
import RadarSweepLoader, { computeAnimDuration } from './RadarSweepLoader'

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

// ── One airport's METAR/TAF/NOTAM summary, latest report only ──
function AirportCard({ target, weather, notams }) {
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
  const viewAllNotams = useViewAllNotams()

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

        <NotamListSection notams={notams} onViewAll={viewAllNotams} />
      </div>
    </div>
  )
}

// ── Route map: real coastlines (worldMap.js) + role-colored airport dots ──
function computeMapBounds(points) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  let minX = Math.min(...xs), maxX = Math.max(...xs)
  let minY = Math.min(...ys), maxY = Math.max(...ys)
  const padX = Math.max((maxX - minX) * 0.15, 18)
  const padY = Math.max((maxY - minY) * 0.15, 18)
  minX = Math.max(minX - padX, 0)
  maxX = Math.min(maxX + padX, WORLD_MAP_WIDTH)
  minY = Math.max(minY - padY, 0)
  maxY = Math.min(maxY + padY, WORLD_MAP_HEIGHT)
  return { minX, minY, w: maxX - minX, h: maxY - minY }
}

function RouteMap({ dep, arr, destAltList, eraList }) {
  const depAp = dep && lookupAirport(dep)
  const arrAp = arr && lookupAirport(arr)

  const markers = []
  if (depAp) markers.push({ icao: dep, label: 'DEPARTURE', ap: depAp, big: true })
  if (arrAp) markers.push({ icao: arr, label: 'ARRIVAL', ap: arrAp, big: true })
  for (const a of destAltList) {
    const ap = lookupAirport(a.icao)
    if (ap) markers.push({ icao: a.icao, label: a.label, ap })
  }
  for (const a of eraList) {
    const ap = lookupAirport(a.icao)
    if (ap) markers.push({ icao: a.icao, label: a.label, ap })
  }
  if (markers.length === 0) return null

  const projected = markers.map(m => ({ ...m, ...projectLatLng(m.ap.lat, m.ap.lng) }))
  const bounds = computeMapBounds(projected)

  // Route curve: a quadratic Bezier through the real great-circle midpoint
  // (not just a straight line or a guessed bow) between dep and arr.
  let routePath = null
  if (depAp && arrAp) {
    const p0 = projectLatLng(depAp.lat, depAp.lng)
    const p2 = projectLatLng(arrAp.lat, arrAp.lng)
    const mid = interpolateGreatCircle(depAp.lat, depAp.lng, arrAp.lat, arrAp.lng, 0.5)
    const pMid = projectLatLng(mid.lat, mid.lng)
    const p1 = { x: 2 * pMid.x - 0.5 * (p0.x + p2.x), y: 2 * pMid.y - 0.5 * (p0.y + p2.y) }
    routePath = `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`
  }

  return (
    <div style={{
      position: 'relative', border: '1px solid var(--cp-border3)', borderRadius: 10,
      overflow: 'hidden', marginBottom: 20, background: 'var(--cp-bg3)', boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
    }}>
      <div style={{
        position: 'absolute', top: 10, left: 14, fontFamily: 'var(--cb-font-mono)', fontSize: 10,
        letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--cp-dim)', zIndex: 1,
      }}>
        Route &amp; Alternates
      </div>
      <svg viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`} style={{
        display: 'block', width: '100%', height: 'auto',
        // Match the container to the route's own bounding-box shape — a
        // fixed wide ratio here squeezes a mostly north-south route (small
        // lng spread, big lat spread) into a thin sliver, shrinking the
        // markers/labels along with it. maxHeight guards against a
        // near-pole-to-pole route making the modal absurdly tall.
        aspectRatio: `${bounds.w} / ${bounds.h}`, maxHeight: 900,
      }}>
        <rect x={bounds.minX} y={bounds.minY} width={bounds.w} height={bounds.h} fill="var(--cp-bg3)" />

        <path d={WORLD_LAND_PATH} fill="var(--cp-dim)" fillOpacity={0.28} fillRule="evenodd" />

        {routePath && (
          <path d={routePath} fill="none" stroke="var(--cp-txt)" strokeWidth={bounds.w / 300}
            strokeDasharray={`${bounds.w / 130} ${bounds.w / 180}`} opacity={0.85} />
        )}

        {projected.map(m => {
          const role = getRoleStyle(m.label)
          const r = (m.big ? bounds.w / 78 : bounds.w / 100)
          const fontSize = bounds.w / (m.big ? 42 : 50)
          return (
            <g key={m.icao}>
              {m.big && <circle cx={m.x} cy={m.y} r={r * 1.7} fill="none" stroke={role.color} strokeWidth={bounds.w / 500} opacity={0.4} />}
              <circle cx={m.x} cy={m.y} r={r} fill={role.color} stroke="var(--cp-bg3)" strokeWidth={bounds.w / 450} />
              {/* Halo behind the code so the route line, coastline or another
                  marker never reads as cutting through it, for any route. */}
              <text x={m.x} y={m.y + (m.y < bounds.minY + bounds.h / 2 ? r * 2.6 : -r * 1.8)}
                textAnchor="middle" fontFamily="var(--cb-font-mono)" fontSize={fontSize}
                fontWeight={m.big ? 700 : 500} fill={role.color}
                paintOrder="stroke" stroke="var(--cp-bg3)" strokeWidth={fontSize / 4} strokeLinejoin="round">
                {m.icao}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function BriefingView() {
  const briefing = useCalculatorStore(s => s.briefing)
  const setBriefingData = useCalculatorStore(s => s.setBriefingData)
  // ✕/Escape/backdrop only hide the overlay — they don't discard the fetched
  // data. A full closeBriefing() would defeat the whole point of caching it:
  // nobody leaves this open indefinitely, so if closing wiped the cache,
  // "survives an offline reopen" would never apply in the one moment it
  // matters (right after actually looking at it). Real staleness is still
  // handled by the 12h expiry (App.jsx) and by a fresh fetch overwriting it.
  const pauseBriefing = useCalculatorStore(s => s.pauseBriefing)
  const { route, data } = briefing

  const [targets] = useState(() => buildAirportTargets(route.dep, route.arr, route.destAlts, route.enrouteCount, route.enrouteAlts))
  const [loading, setLoading] = useState(!data)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)

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
    const onKey = (e) => { if (e.key === 'Escape') pauseBriefing() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pauseBriefing])

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

  return (
    <div
      onClick={pauseBriefing}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 980, background: 'var(--cp-bg)', borderRadius: 12,
          border: '1px solid var(--cp-border)', boxShadow: '0 24px 60px rgba(0,0,0,0.4)', overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 18px', background: 'var(--cp-bg2)', borderBottom: '1px solid var(--cp-border3)',
        }}>
          <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--cp-txt)' }}>
            ✈ Flight Briefing
          </span>
          <button onClick={pauseBriefing} className="cp-btn" style={{ width: 28, height: 28, padding: 0 }}>✕</button>
        </div>

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

              <RouteMap dep={route.dep} arr={route.arr} destAltList={destAltList} eraList={eraList} />

              {/* ── Departure / Arrival ── */}
              {depArr.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div className="cp-section-header"><span className="cp-section-title">Departure &amp; Arrival</span><div className="cp-divider" /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                    {depArr.map(a => <AirportCard key={a.icao} target={a} weather={a} notams={notamsByIcao[a.icao]} />)}
                  </div>
                </div>
              )}

              {/* ── Destination Alternates ── */}
              {destAltList.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div className="cp-section-header"><span className="cp-section-title">Destination Alternates</span><div className="cp-divider" /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                    {destAltList.map(a => <AirportCard key={a.icao} target={a} weather={a} notams={notamsByIcao[a.icao]} />)}
                  </div>
                </div>
              )}

              {/* ── Enroute Alternates ── */}
              {eraList.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div className="cp-section-header"><span className="cp-section-title">Enroute Alternates</span><div className="cp-divider" /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                    {eraList.map(a => <AirportCard key={a.icao} target={a} weather={a} notams={notamsByIcao[a.icao]} />)}
                  </div>
                </div>
              )}

              {/* ── NOTAMs for route FIRs (airspace/oceanic notices) ── */}
              <div style={{ marginBottom: 20 }}>
                <div className="cp-section-header"><span className="cp-section-title">Notams — Route Firs</span><div className="cp-divider" /></div>
                {firsUsed.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--cp-dim)' }}>No FIRs could be determined from this route.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                    {firsUsed.map(fir => <FirNotamCard key={fir.icao} fir={fir} notams={notamsByIcao[fir.icao]} />)}
                  </div>
                )}
              </div>

              {/* ── SIGMETs ── */}
              <div>
                <div className="cp-section-header"><span className="cp-section-title">Sigmets — Route Firs</span><div className="cp-divider" /></div>
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
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
