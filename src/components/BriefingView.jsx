import React, { useEffect, useState } from 'react'
import { fetchWeather } from '../services/weatherAPI'
import { fetchNotams, detectRouteFirs } from '../services/notamAPI'
import { fetchAllSigmets } from '../services/sigmetAPI'
import { icaoToFir } from '../data/firLookup'
import { lookupAirport } from '../data/airports'
import {
  CAT_COLORS, WIND_COLORS,
  getMetarFlightCat, getWindSev, tokenizeRaw, parseTafSegments,
  getRoleStyle,
} from '../utils/metarSeverity'
import { filterSigmetsByFir } from '../utils/sigmet'
import SigmetCard from './SigmetCard'

const CAT_ORDER = ['VFR', 'MVFR', 'IFR', 'LIFR']

// ── Build the same ordered, deduped airport list every module builds ──
function buildAirportTargets(dep, arr, destAlts, enrouteCount, enrouteAlts) {
  const list = []
  const add = (icao, label) => {
    if (!icao || typeof icao !== 'string') return
    if (icao.trim().length >= 3) list.push({ icao: icao.trim().toUpperCase(), label })
  }
  add(dep, 'DEPARTURE')
  add(arr, 'ARRIVAL')
  add(destAlts?.alt1, 'DESTINATION ALTERNATE 1')
  add(destAlts?.alt2, 'DESTINATION ALTERNATE 2')
  for (let i = 0; i < enrouteCount; i++) add(enrouteAlts?.[i], `ENROUTE ALTERNATE ${i + 1}`)
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

function worstCategory(cats) {
  let worst = null
  for (const c of cats) {
    if (!c) continue
    if (worst === null || CAT_ORDER.indexOf(c) > CAT_ORDER.indexOf(worst)) worst = c
  }
  return worst
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
  const activeNotams = (notams || []).filter(n => n.validity.status === 'ACTIVE')

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

        <div>
          <div className="cp-label" style={{ marginBottom: 3 }}>NOTAMS · {activeNotams.length} ACTIVE</div>
          {activeNotams.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--cp-dim)', fontStyle: 'italic' }}>No active NOTAMs</div>
          ) : (
            <div>
              {activeNotams.map((n, i) => (
                <div key={n.id} style={{
                  fontSize: 11.5, lineHeight: 1.4, padding: '6px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--cp-border3)', display: 'flex', gap: 8,
                }}>
                  <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10.5, color: 'var(--cp-dim)', flexShrink: 0 }}>
                    {n.id}
                  </span>
                  <span style={{ color: 'var(--cp-muted)' }}>{n.summary}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BriefingView({ dep, arr, destAlts, enrouteCount, enrouteAlts, firs, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [airports, setAirports] = useState([])       // [{ icao, label, metar, taf, ... }]
  const [notamsByIcao, setNotamsByIcao] = useState({})
  const [sigmets, setSigmets] = useState([])
  const [firsUsed, setFirsUsed] = useState([])
  const [fetchedAt, setFetchedAt] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      const targets = buildAirportTargets(dep, arr, destAlts, enrouteCount, enrouteAlts)
      if (targets.length === 0) {
        setError('No airports entered.')
        setLoading(false)
        return
      }
      const resolvedFirs = (firs && firs.length) ? firs : autoDetectFirs(dep, arr, destAlts, enrouteCount, enrouteAlts)

      const [weatherList, notamResult, allSigmets] = await Promise.all([
        Promise.all(targets.map(async (t) => ({ ...t, ...(await fetchWeather(t.icao, 2)) }))),
        fetchNotams(targets.map(t => t.icao)),
        fetchAllSigmets(AbortSignal.timeout(15_000)).catch(() => []),
      ])
      if (cancelled) return

      const notamBySource = {}
      for (const n of notamResult.notams) (notamBySource[n.source] ??= []).push(n)

      const firIds = new Set(resolvedFirs.map(f => f.icao.toUpperCase()))
      const scopedSigmets = filterSigmetsByFir(allSigmets, firIds)
        .sort((a, b) => (a.validTo?.getTime() ?? Infinity) - (b.validTo?.getTime() ?? Infinity))

      setAirports(weatherList)
      setNotamsByIcao(notamBySource)
      setSigmets(scopedSigmets)
      setFirsUsed(resolvedFirs)
      setFetchedAt(Date.now())
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const depArr = airports.filter(a => a.label === 'DEPARTURE' || a.label === 'ARRIVAL')
  const destAltList = airports.filter(a => a.label.startsWith('DESTINATION ALTERNATE'))
  const eraList = airports.filter(a => a.label.startsWith('ENROUTE ALTERNATE'))

  const worstCat = worstCategory(airports.map(a => getMetarFlightCat(a.metar?.[0])))
  const activeNotamCount = Object.values(notamsByIcao).flat().filter(n => n.validity.status === 'ACTIVE').length

  return (
    <div
      onClick={onClose}
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
          <button onClick={onClose} className="cp-btn" style={{ width: 28, height: 28, padding: 0 }}>✕</button>
        </div>

        <div style={{ padding: '18px 20px 24px' }}>
          {loading ? (
            <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 12, color: 'var(--cp-dim)',
              letterSpacing: '0.1em', padding: '40px 0', textAlign: 'center' }}>
              ⊙ FETCHING BRIEFING…
            </div>
          ) : error ? (
            <div style={{ color: 'var(--cp-red)', fontFamily: 'var(--cb-font-mono)', fontSize: 12,
              letterSpacing: '0.08em', padding: '20px 0' }}>
              ERROR · {error}
            </div>
          ) : (
            <>
              <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 10, color: 'var(--cp-dim)',
                letterSpacing: '0.08em', marginBottom: 14 }}>
                {dep && arr ? `${dep} → ${arr}` : dep || arr}
                {fetchedAt && ` · FETCHED ${new Date(fetchedAt).toUTCString().toUpperCase()}`}
              </div>

              {/* ── Summary ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'AIRPORTS', value: airports.length, color: 'var(--cp-txt)' },
                  { label: 'WORST CATEGORY', value: worstCat || '—', color: worstCat ? CAT_COLORS[worstCat] : 'var(--cp-dim)' },
                  { label: 'ACTIVE NOTAMS', value: activeNotamCount, color: 'var(--cp-txt)' },
                  { label: 'SIGMETS (ROUTE FIRS)', value: sigmets.length, color: sigmets.length ? 'var(--cp-red)' : 'var(--cp-txt)' },
                ].map(s => (
                  <div key={s.label} className="cp-card-bg2" style={{ border: '1px solid var(--cp-border3)',
                    borderRadius: 6, padding: '10px 12px' }}>
                    <div className="cp-label" style={{ marginBottom: 4, fontSize: 9.5 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: 'var(--cb-font-mono)',
                      fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                  </div>
                ))}
              </div>

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
