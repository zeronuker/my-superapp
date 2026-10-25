import { useState, useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCalculatorStore } from '../store/calculatorStore'
import { loadWithExpiry, useExpiry } from '../utils/cacheExpiry'
import { BRIEFING_SETUP_CACHE_KEY } from '../utils/moduleCacheKeys'
import { parseRoute } from '../utils/routeParse'
import { ofpToFields } from '../utils/ofpParse'
import { utcParts, localParts, blockMinutes, fmtHm, ofpWarning } from '../utils/ofpTimes'
import { getRoleStyle } from '../utils/metarSeverity'
import { readOfpFile } from '../services/ofpFile'
import { icaoToFir } from '../data/firLookup'
import ResetButton from './ResetButton'
import RouteInput from './RouteInput'
import EnrouteAlternates from './EnrouteAlternates'
import Seg from './Seg'

// The front door for a flight: import the OFP (or type the flight in), check
// the summary, open the Briefing. Opening it also fills the METAR/TAF, NOTAM
// and SIGMET tabs (briefingSync.js), so they show the same flight.
const CACHE_KEY = BRIEFING_SETUP_CACHE_KEY
const ERA_MAX = 5
const PAGE_SIZE = 5   // saved briefings per page

function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch (_) {}
}

function SectionHeader({ title }) {
  return (
    <div className="cp-section-header">
      <span className="cp-section-title">{title}</span>
      <div className="cp-divider" />
    </div>
  )
}

const monoInput = { fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.12em' }
const panel = { border: '1px solid var(--cp-border)', borderRadius: 10, background: 'var(--cp-bg2)', padding: 14, marginBottom: 20 }
const smallBtn = { padding: '8px 12px', fontSize: 10, borderRadius: 6, letterSpacing: '0.16em' }
const accentBtn = { ...smallBtn, borderColor: 'var(--cp-acc)', color: 'var(--cp-acc)', background: 'var(--cp-accdim)' }

// An airport chip in the colour the weather cards and the map give its role
// (destination alternate 1/2, enroute alternate 1…5). `role` null = the FIR colour.
function Chip({ code, role }) {
  const s = role ? getRoleStyle(role) : null
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', marginRight: 6, borderRadius: 4,
      border: `1px solid ${s ? s.borderLatest : 'var(--cp-fir)'}`, color: s ? s.color : 'var(--cp-fir)',
      background: s ? s.bgLatest : 'transparent', fontFamily: 'var(--cb-font-mono)', fontSize: 12,
    }}>{code}</span>
  )
}

const none = <span style={{ color: 'var(--cp-dim)', fontSize: 12 }}>none</span>

function Field({ label, value, sub, flex = 1 }) {
  return (
    <div style={{ flex, minWidth: 0 }}>
      <div className="cp-label" style={{ margin: '0 0 3px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 14, letterSpacing: '0.04em' }}>{value ?? '—'}</div>
      {sub && <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginTop: 2, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{sub}</div>}
    </div>
  )
}

// STD or STA: the UTC time and date, then the local time (with offset) and date at that airport.
function TimeCol({ label, iso, tz, align }) {
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

function Row({ label, children, stacked }) {
  return (
    <div style={{
      display: 'flex', flexDirection: stacked ? 'column' : 'row', justifyContent: 'space-between', alignItems: stacked ? 'stretch' : 'flex-start',
      gap: stacked ? 4 : 10, padding: '8px 0', borderBottom: '1px solid var(--cp-border3)',
    }}>
      <span className="cp-label" style={{ margin: 0, paddingTop: stacked ? 0 : 3 }}>{label}</span>
      <span style={{ textAlign: stacked ? 'left' : 'right' }}>{children}</span>
    </div>
  )
}

const shortDate = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function BriefingModule() {
  const { saves, openBriefing, openSavedBriefing, deleteSavedBriefing } = useCalculatorStore(useShallow(s => ({
    saves: s.briefing.saves,
    openBriefing: s.openBriefing,
    openSavedBriefing: s.openSavedBriefing,
    deleteSavedBriefing: s.deleteSavedBriefing,
  })))
  const [cache] = useState(() => loadWithExpiry(CACHE_KEY))
  const [mode,         setMode]         = useState(cache?.mode || 'ofp')
  // Set when the flight came from an OFP: { flight, info (tail, type, ofpNo, std, sta, computed, tripMin, distNm), filedRoute, depTz, arrTz }
  const [ofp,          setOfp]          = useState(cache?.ofp ?? null)
  const [dep,          setDep]          = useState(cache?.dep || '')
  const [arr,          setArr]          = useState(cache?.arr || '')
  const [routeText,    setRouteText]    = useState(cache?.routeText || '')
  const [destAlts,     setDestAlts]     = useState(cache?.destAlts || { alt1: '', alt2: '' })
  const [enrouteCount, setEnrouteCount] = useState(cache?.enrouteCount ?? 1)
  const [enrouteAlts,  setEnrouteAlts]  = useState(cache?.enrouteAlts || Array(ERA_MAX).fill(''))
  const [firs,         setFirs]         = useState(cache?.firs || [])
  const [importedAt,   setImportedAt]   = useState(cache?.fetchedAt || null)
  const [firInput,     setFirInput]     = useState('')
  const [busy,         setBusy]         = useState(false)
  const [importError,  setImportError]  = useState('')
  const [page,         setPage]         = useState(cache?.savedPage || 1)   // saved-list page, kept when you leave the tab
  const fileRef = useRef(null)

  useEffect(() => {
    saveCache({ mode, ofp, dep, arr, routeText, destAlts, enrouteCount, enrouteAlts, firs, savedPage: page, fetchedAt: importedAt })
  }, [mode, ofp, dep, arr, routeText, destAlts, enrouteCount, enrouteAlts, firs, page, importedAt])

  const handleReset = () => {
    setMode('ofp'); setOfp(null); setPage(1)
    setDep(''); setArr(''); setRouteText('')
    setDestAlts({ alt1: '', alt2: '' })
    setEnrouteCount(1); setEnrouteAlts(Array(ERA_MAX).fill(''))
    setFirs([]); setFirInput(''); setImportedAt(null); setImportError('')
    try { localStorage.removeItem(CACHE_KEY) } catch (_) {}
  }

  useExpiry(importedAt, handleReset)

  const pickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''   // lets the same file be chosen again
    if (!file) return
    setBusy(true); setImportError('')
    const r = await readOfpFile(file)
    setBusy(false)
    if (!r.ok) { setImportError(r.error); return }
    const f = ofpToFields(r, ERA_MAX)
    setDep(f.dep); setArr(f.arr); setRouteText(f.routeText)
    setDestAlts(f.destAlts); setEnrouteCount(f.enrouteCount); setEnrouteAlts(f.enrouteAlts)
    setFirs(f.firs ?? [])
    // Airport time zones for the local times; loaded now so the airport list stays out of this tab's own chunk.
    let depTz = null, arrTz = null
    try {
      const { lookupAirport } = await import('../data/airports')
      depTz = lookupAirport(f.dep)?.tz ?? null
      arrTz = lookupAirport(f.arr)?.tz ?? null
    } catch (_) {}
    setOfp({ flight: f.flight, info: f.info, filedRoute: f.filedRoute, depTz, arrTz })
    setImportedAt(Date.now())
    setMode('ofp')
  }

  const addFir = () => {
    const val = firInput.trim().toUpperCase()
    setFirInput('')
    if (val.length < 3) return
    // A bare airport ICAO is resolved to its home FIR — SIGMETs and NOTAMs are FIR-scoped.
    const fir = icaoToFir(val)
    const entry = fir ? { icao: fir.icao, name: fir.name } : { icao: val, name: val }
    setFirs(prev => (prev.some(c => c.icao === entry.icao) ? prev : [...prev, entry]))
  }

  const ready = dep.length === 4 && arr.length === 4
  const openIt = () => ready && openBriefing({ dep, arr, routeText, destAlts, enrouteCount, enrouteAlts, firs })

  const parsed = useMemo(() => parseRoute(routeText), [routeText])
  // The saves load from storage a moment after the tab opens, so `page` is only clamped when
  // drawing: deleting the last briefing on a page lands on the page before it.
  const pages = Math.max(1, Math.ceil(saves.length / PAGE_SIZE))
  const cur = Math.min(page, pages)
  const shown = saves.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)

  const info = ofp?.info
  const warning = info ? ofpWarning(Date.now(), info) : null
  const warnColor = warning?.level === 'past' ? 'var(--cp-red)' : 'var(--cp-yellow)'
  const blockMin = info ? blockMinutes(info.std, info.sta) : null
  const routeShown = parsed.pts ? ofp?.filedRoute : parsed.fixes.join(' ')

  const fileInput = (
    <input ref={fileRef} type="file" accept=".txt,.xml,.pdf,application/pdf,text/plain,text/xml"
      onChange={pickFile} style={{ display: 'none' }} aria-label="Import OFP file" />
  )

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Seg value={mode} onChange={setMode} options={[{ value: 'ofp', label: 'FROM OFP' }, { value: 'manual', label: 'MANUAL' }]} />
        <ResetButton onReset={handleReset} />
      </div>
      {fileInput}

      {mode === 'ofp' && !ofp && (
        <div style={{ ...panel, textAlign: 'center', padding: '22px 14px' }}>
          <div style={{ fontSize: 30, lineHeight: 1 }} aria-hidden="true">📄</div>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 14, margin: '10px 0 4px' }}>Import your OFP</div>
          <div style={{ fontSize: 11, color: 'var(--cp-dim)', marginBottom: 14 }}>XmlOFP (.txt, .xml) or PFP (.pdf). Read on this device, nothing is uploaded.</div>
          <button className="cp-btn" onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...accentBtn, padding: '12px 22px' }}>
            {busy ? 'READING…' : '⇪  IMPORT OFP'}
          </button>
          {importError && <div style={{ fontSize: 12, marginTop: 12, color: 'var(--cp-yellow)' }}>{importError}</div>}
        </div>
      )}

      {mode === 'ofp' && ofp && (
        <div style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span className="cp-label" style={{ margin: 0, color: 'var(--cp-acc)' }}>FROM OFP</span>
            <span style={{ color: 'var(--cp-green)', fontSize: 16 }} aria-hidden="true">✓</span>
          </div>
          {warning && (
            <div style={{
              border: `1px solid ${warnColor}`, color: warnColor, borderRadius: 6, padding: '8px 10px', marginBottom: 10,
              background: `color-mix(in srgb, ${warnColor} 10%, transparent)`, fontSize: 12, lineHeight: 1.5,
            }}>{warning.text}</div>
          )}

          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <Field label="FLIGHT" value={ofp.flight} />
            <Field label="TAIL" value={info?.tail} sub={info?.type?.replace('/', '/​')} flex={1.7} />
            <Field label="OFP NO." value={info?.ofpNo} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 10px', fontFamily: 'var(--cb-font-mono)' }}>
            <span style={{ fontSize: 22, letterSpacing: '0.06em' }}>{dep || '----'}</span>
            <span style={{ flex: 1, borderTop: '1.5px dashed var(--cp-dim)' }} />
            <span style={{ color: 'var(--cp-acc)', fontSize: 16, lineHeight: 1 }} aria-hidden="true">✈</span>
            <span style={{ flex: 1, borderTop: '1.5px dashed var(--cp-dim)' }} />
            <span style={{ fontSize: 22, letterSpacing: '0.06em' }}>{arr || '----'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
            <TimeCol label="STD" iso={info?.std} tz={ofp.depTz} align="left" />
            <TimeCol label="STA" iso={info?.sta} tz={ofp.arrTz} align="right" />
          </div>
          <div style={{ display: 'flex', gap: 10, margin: '12px 0', padding: '10px 0', borderTop: '1px solid var(--cp-border3)', borderBottom: '1px solid var(--cp-border3)' }}>
            <Field label="BLOCK" value={fmtHm(blockMin)} />
            <Field label="TRIP" value={fmtHm(info?.tripMin)} />
            <Field label="DISTANCE" value={info?.distNm != null ? `${info.distNm.toLocaleString('en-US')} NM` : null} />
          </div>

          <Row label="DEST ALTS">
            {destAlts.alt1 || destAlts.alt2 ? (
              <>
                {destAlts.alt1 && <Chip code={destAlts.alt1} role="DESTINATION ALTERNATE 1" />}
                {destAlts.alt2 && <Chip code={destAlts.alt2} role="DESTINATION ALTERNATE 2" />}
              </>
            ) : none}
          </Row>
          <Row label="ENROUTE">
            {enrouteAlts.slice(0, enrouteCount).some(Boolean)
              ? enrouteAlts.slice(0, enrouteCount).map((c, i) => c && <Chip key={i} code={c} role={`ENROUTE ALTERNATE ${i + 1}`} />)
              : none}
          </Row>
          <Row label="ROUTE" stacked>
            {routeShown
              ? <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 12, lineHeight: 1.6, overflowWrap: 'anywhere' }}>{routeShown}</div>
              : none}
          </Row>
          {firs.length > 0 && (
            <Row label="FIRS" stacked>
              <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 12, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                {firs.map((f, i) => <span key={f.icao} style={{ color: 'var(--cp-fir)' }}>{i ? ' ' : ''}{f.icao}</span>)}
              </div>
            </Row>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="cp-btn" onClick={() => fileRef.current?.click()} disabled={busy} style={smallBtn}>{busy ? 'READING…' : 'CHANGE OFP'}</button>
            <button className="cp-btn" onClick={() => setMode('manual')} style={smallBtn}>EDIT OFP</button>
          </div>
          {importError && <div style={{ fontSize: 12, marginTop: 10, color: 'var(--cp-yellow)' }}>{importError}</div>}
        </div>
      )}

      {mode === 'manual' && (
        <>
          <SectionHeader title="Route" />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <div className="cp-label" style={{ marginBottom: 4 }}>DEPARTURE</div>
              <input className="cp-input" style={monoInput} placeholder="e.g. EGLL" value={dep} maxLength={4}
                onChange={e => setDep(e.target.value.toUpperCase())} />
            </div>
            <button onClick={() => { setDep(arr); setArr(dep) }} title="Swap departure and arrival" aria-label="Swap departure and arrival"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cp-acc)', fontSize: 20,
                paddingBottom: 9, flexShrink: 0, fontFamily: 'var(--cb-font-mono)', lineHeight: 1 }}>⇄</button>
            <div style={{ flex: 1 }}>
              <div className="cp-label" style={{ marginBottom: 4 }}>ARRIVAL</div>
              <input className="cp-input" style={monoInput} placeholder="e.g. OMDB" value={arr} maxLength={4}
                onChange={e => setArr(e.target.value.toUpperCase())} />
            </div>
          </div>

          <RouteInput value={routeText} onChange={setRouteText} onAirports={(d, a) => { setDep(d); setArr(a) }} dep={dep} arr={arr} label={ofp?.filedRoute} />

          <SectionHeader title="Destination Alternates" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[{ key: 'alt1', label: 'DEST ALT 1' }, { key: 'alt2', label: 'DEST ALT 2' }].map(({ key, label }) => (
              <div key={key}>
                <div className="cp-label" style={{ marginBottom: 4 }}>{label}</div>
                <input className="cp-input" style={monoInput} placeholder="ICAO" value={destAlts[key]} maxLength={4}
                  onChange={e => setDestAlts(p => ({ ...p, [key]: e.target.value.toUpperCase() }))} />
              </div>
            ))}
          </div>

          <EnrouteAlternates count={enrouteCount} alts={enrouteAlts} max={ERA_MAX}
            onChange={({ count, alts }) => { setEnrouteCount(count); setEnrouteAlts(alts) }} inputStyle={monoInput} />

          <SectionHeader title="FIRs (optional)" />
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input className="cp-input" placeholder="Add an ICAO airport or FIR code…" value={firInput} maxLength={4}
              onChange={e => setFirInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && addFir()}
              style={{ flex: 1, ...monoInput }} />
            <button className="cp-btn" onClick={addFir} disabled={!firInput} style={{ ...accentBtn, opacity: firInput ? 1 : 0.4 }}>+ ADD</button>
          </div>
          <div style={{ marginBottom: 20 }}>
            {firs.map(f => (
              <span key={f.icao} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', marginRight: 6, marginBottom: 6,
                borderRadius: 4, border: '1px solid color-mix(in srgb, var(--cp-fir) 45%, transparent)', color: 'var(--cp-fir)',
                background: 'color-mix(in srgb, var(--cp-fir) 10%, transparent)',
                fontFamily: 'var(--cb-font-mono)', fontSize: 12,
              }}>{f.icao}
                <button onClick={() => setFirs(prev => prev.filter(x => x.icao !== f.icao))} aria-label={`Remove ${f.icao}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cp-red)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
        </>
      )}

      <SectionHeader title={`Saved Briefings${saves.length ? ` · ${saves.length}` : ''}`} />
      {saves.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--cp-dim)', marginBottom: 20 }}>No saved briefings yet.</div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {shown.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid var(--cp-border3)' }}>
              <button onClick={() => openSavedBriefing(b.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}>
                <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 13, color: 'var(--cp-txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
                <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', marginTop: 2 }}>
                  {b.route?.dep} → {b.route?.arr} · {shortDate(b.savedAt)}
                </div>
              </button>
              <button onClick={() => deleteSavedBriefing(b.id)} title="Delete" aria-label={`Delete ${b.name}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cp-dim)', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
          ))}
          {saves.length > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
              <button className="cp-btn" onClick={() => setPage(cur - 1)} disabled={cur === 1}
                style={{ ...smallBtn, opacity: cur === 1 ? 0.4 : 1 }}>‹ PREV</button>
              <div style={{ textAlign: 'center', fontFamily: 'var(--cb-font-mono)' }}>
                <div style={{ fontSize: 13 }}>{(cur - 1) * PAGE_SIZE + 1}–{Math.min(saves.length, cur * PAGE_SIZE)} of {saves.length}</div>
                <div style={{ fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.08em' }}>PAGE {cur} OF {pages}</div>
              </div>
              <button className="cp-btn" onClick={() => setPage(cur + 1)} disabled={cur === pages}
                style={{ ...smallBtn, opacity: cur === pages ? 0.4 : 1 }}>NEXT ›</button>
            </div>
          )}
        </div>
      )}

      <div style={{ position: 'sticky', bottom: 0, background: 'var(--cp-bg)', borderTop: '1px solid var(--cp-border3)', padding: '10px 0', marginTop: 8 }}>
        <button className="cp-btn" onClick={openIt} disabled={!ready}
          style={{
            width: '100%', opacity: ready ? 1 : 0.4, padding: '14px 10px', fontSize: 11, borderRadius: 6, letterSpacing: '0.16em',
            border: '2px solid var(--cp-green)', color: 'var(--cp-green)',
            background: 'color-mix(in srgb, var(--cp-green) 18%, transparent)',
          }}>GENERATE BRIEFING</button>
      </div>
    </div>
  )
}
