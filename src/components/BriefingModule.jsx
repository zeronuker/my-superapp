import { useState, useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCalculatorStore } from '../store/calculatorStore'
import { loadWithExpiry, useExpiry } from '../utils/cacheExpiry'
import { BRIEFING_SETUP_CACHE_KEY } from '../utils/moduleCacheKeys'
import { parseRoute } from '../utils/routeParse'
import { ofpToFields } from '../utils/ofpParse'
import { blockMinutes, fmtHm, ofpWarning } from '../utils/ofpTimes'
import { readOfpFile } from '../services/ofpFile'
import { icaoToFir } from '../data/firLookup'
import { briefingRow, filterSaves } from '../utils/savedBriefings'
import { resolveLinks } from '../utils/briefingLink'
import ResetButton from './ResetButton'
import RouteInput from './RouteInput'
import EnrouteAlternates from './EnrouteAlternates'
import Seg from './Seg'
import { Field, TimeCol, Chip } from './OfpBits'
import { useOnlineStatus } from '../utils/useOnlineStatus'
import useDutyLogStore from '../modules/dutylog/store/dutylogStore'
import { syncBriefingsNow, syncLogsNow } from '../services/briefingCloud'
import { CloudView, BriefingRowText } from './SavedBriefingsCloud'
import { ModuleHeader, InfoBanner } from './ModuleChrome'
import { useTransitionAnim } from '../useTransitionAnim'
import { SyncStatus, SyncBar, rowSyncing } from './SyncStatus'

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

const none = <span style={{ color: 'var(--cp-dim)', fontSize: 12 }}>none</span>

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

export default function BriefingModule() {
  const { saves, cloud, openBriefing, openSavedBriefing, deleteSavedBriefing } = useCalculatorStore(useShallow(s => ({
    saves: s.briefing.saves,
    cloud: s.briefing.cloud,
    openBriefing: s.openBriefing,
    openSavedBriefing: s.openSavedBriefing,
    deleteSavedBriefing: s.deleteSavedBriefing,
  })))
  const [cache] = useState(() => loadWithExpiry(CACHE_KEY))
  const [mode,         setMode]         = useState(cache?.mode || 'ofp')
  // Set when the flight came from an OFP: { flight, info (tail, type, ofpNo, std, sta, computed, tripMin, distNm), details (ofpDetails.js), filedRoute, depTz, arrTz }
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
  const [detecting,    setDetecting]    = useState(false)
  const [busy,        setBusy]         = useState(false)
  const [importError,  setImportError]  = useState('')
  const [page,         setPage]         = useState(cache?.savedPage || 1)   // saved-list page, kept when you leave the tab
  const [query,        setQuery]        = useState('')   // saved-list search, not kept
  const [screen,       setScreen]       = useState('list')   // 'list' (saved briefings) | 'new' (set a flight up)
  const animStyle = useCalculatorStore(s => s.settings.animStyle)
  const dutyLogs = useDutyLogStore(s => s.logs)
  const links = useMemo(() => resolveLinks(dutyLogs, saves), [dutyLogs, saves])
  const screenAnim = useTransitionAnim(screen, ['list', 'new'], animStyle)
  const fileRef = useRef(null)
  const syncCode = useDutyLogStore(s => s.syncCode)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncError, setSyncError] = useState('')
  // A row's SYNC: the saved briefings go up, then the duty logs too if that briefing is linked to one.
  const syncNow = async (saveId) => {
    setSyncError(''); setSyncBusy(true)
    try {
      await syncBriefingsNow()
      if (links.bySave.has(saveId)) await syncLogsNow()
    } catch (e) { setSyncError(e.message) }
    setSyncBusy(false)
  }

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
    setOfp({ flight: f.flight, info: f.info, details: f.details, filedRoute: f.filedRoute, depTz, arrTz })
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

  // Same as the NOTAM and SIGMET tabs' button: each airport's home FIR plus the FIRs along the
  // dep→arr great circle, added to whatever is already listed. Loaded on demand so the airport
  // list stays out of this tab's own chunk.
  const detectFirs = async () => {
    setDetecting(true)
    try {
      const { autoDetectFirs } = await import('../services/notamAPI')
      const found = autoDetectFirs(dep, arr, destAlts, enrouteCount, enrouteAlts, firs.map(f => f.icao))
      setFirs(prev => [...prev, ...found.filter(f => !prev.some(p => p.icao === f.icao))])
    } catch (_) {}
    setDetecting(false)
  }

  const isOnline = useOnlineStatus()
  const ready = dep.length === 4 && arr.length === 4 && isOnline
  // The Flight Details tab only for a flight that still is the imported OFP's (EDIT OFP can change dep/arr).
  const flightDetails = ofp?.details && ofp.details.dep === dep && ofp.details.arr === arr
    ? { ...ofp.details, flight: ofp.flight, info: ofp.info, depTz: ofp.depTz, arrTz: ofp.arrTz }
    : null
  const openIt = () => ready && openBriefing({ dep, arr, routeText, destAlts, enrouteCount, enrouteAlts, firs, flightDetails })

  const parsed = useMemo(() => parseRoute(routeText), [routeText])
  // The saves load from storage a moment after the tab opens, so `page` is only clamped when
  // drawing: deleting the last briefing on a page lands on the page before it.
  const found = useMemo(() => filterSaves(saves, query), [saves, query])
  const pages = Math.max(1, Math.ceil(found.length / PAGE_SIZE))
  const cur = Math.min(page, pages)
  const shown = found.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)

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
      {/* Two pages, like the Duty Log: the saved list, and the page + NEW opens to set a flight up. */}
      <div key={screen} className={screenAnim.className} style={screenAnim.style}>
      {screen === 'new' ? (
      <>
      <ModuleHeader title="NEW BRIEFING" subtitle="FLIGHT BRIEFING PACK"
        back={<button onClick={() => setScreen('list')} className="cp-btn" style={{ fontSize: 10, padding: '4px 9px', marginBottom: 8, letterSpacing: '0.1em' }}>‹ BACK</button>}
        action={<ResetButton onReset={handleReset} />} />
      <div style={{ marginBottom: 14 }}>
        <Seg value={mode} onChange={setMode} options={[{ value: 'ofp', label: 'FROM OFP' }, { value: 'manual', label: 'MANUAL' }]} />
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

          {/* Laid out like the FIR block on the NOTAM and SIGMET tabs: auto-detect, the chips, then the add box. */}
          <SectionHeader title="FIRs (optional)" />
          <button onClick={detectFirs} disabled={detecting || !dep || !arr} style={{
            width: '100%', marginBottom: 10,
            background: 'rgba(var(--cp-acc-rgb,63,224,197),0.06)',
            border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.25)',
            borderRadius: 6, padding: '9px', cursor: 'pointer', opacity: !dep || !arr ? 0.4 : 1,
            fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--cp-acc)',
          }}>
            {detecting ? '⊙ DETECTING…' : '⊕ AUTO-DETECT FIRs (ROUTE + HOME FIRs)'}
          </button>

          {firs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {firs.map(f => (
                <div key={f.icao} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 20, padding: '4px 8px 4px 12px',
                  background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.40)' }}>
                  <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--cp-fir)', letterSpacing: '0.08em' }}>{f.icao}</span>
                  <span style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 8, color: 'var(--cp-fir)', opacity: 0.8 }}>FIR</span>
                  <button onClick={() => setFirs(prev => prev.filter(x => x.icao !== f.icao))} aria-label={`Remove ${f.icao}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cp-dim)', fontSize: 13, lineHeight: 1, padding: '0 2px' }}>×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <input className="cp-input" placeholder="Add ICAO airport or FIR code…" value={firInput}
              maxLength={4} onChange={e => setFirInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && addFir()}
              style={{ flex: 1, fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.08em' }} />
            <button onClick={addFir} disabled={!firInput} style={{
              background: 'rgba(var(--cp-acc-rgb,63,224,197),0.1)', border: '1px solid rgba(var(--cp-acc-rgb,63,224,197),0.3)',
              borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontFamily: 'var(--cb-font-mono)', fontSize: 9,
              letterSpacing: '0.12em', color: 'var(--cp-acc)', opacity: firInput ? 1 : 0.4 }}>+ ADD</button>
          </div>
        </>
      )}

      <div style={{ position: 'sticky', bottom: 0, background: 'var(--cp-bg)', borderTop: '1px solid var(--cp-border3)', padding: '10px 0', marginTop: 8 }}>
        <button className="cp-btn" onClick={openIt} disabled={!ready}
          style={{
            width: '100%', opacity: ready ? 1 : 0.4, padding: '14px 10px', fontSize: 11, borderRadius: 6, letterSpacing: '0.16em',
            border: '2px solid var(--cp-green)', color: 'var(--cp-green)',
            background: 'color-mix(in srgb, var(--cp-green) 18%, transparent)',
          }}>{isOnline ? 'GENERATE BRIEFING' : 'OFFLINE — CONNECT TO GENERATE'}</button>
      </div>
      </>
      ) : (
      <>
      <ModuleHeader title="BRIEFING" subtitle="FLIGHT BRIEFING PACK" action={
        <button onClick={() => setScreen('new')} className="cp-btn" style={{
          color: 'var(--cp-acc)', borderColor: 'var(--cp-acc)', background: 'var(--cp-accdim)',
          display: 'inline-flex', alignItems: 'center', gap: 5, letterSpacing: '0.1em',
        }}>+ NEW</button>
      } />

      <InfoBanner>Saved briefings are stored locally on this device. Use Cloud Sync in Settings for an optional online sync.</InfoBanner>

      {saves.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative' }}>
            <input className="cp-input" style={{ width: '100%', boxSizing: 'border-box', paddingRight: 32 }} placeholder="Search flight, ICAO, tail, name…"
              value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} aria-label="Search saved briefings" />
            {query && (
              <button onClick={() => { setQuery(''); setPage(1) }} title="Clear search" aria-label="Clear search"
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cp-dim)', fontSize: 18, lineHeight: 1, padding: '0 6px' }}>×</button>
            )}
          </div>
          <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 8, color: 'var(--cp-dim)', letterSpacing: '0.04em', lineHeight: 1.6, marginTop: 6 }}>
            Search by flight no, route, tail, aircraft type or OFP number.
          </div>
        </div>
      )}

      <div className="cp-label" style={{ marginBottom: 10 }}>
        Saved · offline{query.trim() ? ` · ${found.length} of ${saves.length} match${found.length === 1 ? '' : 'es'}` : ''}
      </div>
      {saves.length === 0 ? (
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 11, color: 'var(--cp-dim)', letterSpacing: '0.08em', textAlign: 'center', padding: '32px 0' }}>
          NO SAVED BRIEFINGS YET — TAP NEW TO START
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {found.length === 0 && <div style={{ fontSize: 12, color: 'var(--cp-dim)' }}>No saved briefings match.</div>}
          {shown.map(b => {
            const synced = cloud.synced[b.id] === b.name
            const syncing = rowSyncing(syncBusy, synced)
            return (
              <div key={b.id} style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', marginBottom: 8, border: `1px solid ${syncing ? 'var(--cp-acc)' : 'var(--cp-border)'}`, borderRadius: 10, background: 'var(--cp-bg2)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                {/* A div, not a button: the sync status inside it can be a button. */}
                <div role="button" tabIndex={0} onClick={() => openSavedBriefing(b.id)}
                  onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openSavedBriefing(b.id) } }}
                  style={{ width: '100%', textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
                  <BriefingRowText r={briefingRow(b)} logged={links.bySave.has(b.id)}
                    status={<SyncStatus syncCode={syncCode} synced={synced} busy={syncBusy} onSync={() => syncNow(b.id)} />} />
                </div>
                </div>
                <button onClick={() => deleteSavedBriefing(b.id)} title="Delete" aria-label={`Delete ${b.name}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cp-dim)', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
                <SyncBar active={syncing} />
              </div>
            )
          })}
          {found.length > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
              <button className="cp-btn" onClick={() => setPage(cur - 1)} disabled={cur === 1}
                style={{ ...smallBtn, opacity: cur === 1 ? 0.4 : 1 }}>‹ PREV</button>
              <div style={{ textAlign: 'center', fontFamily: 'var(--cb-font-mono)' }}>
                <div style={{ fontSize: 13 }}>{(cur - 1) * PAGE_SIZE + 1}–{Math.min(found.length, cur * PAGE_SIZE)} of {found.length}</div>
                <div style={{ fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.08em' }}>PAGE {cur} OF {pages}</div>
              </div>
              <button className="cp-btn" onClick={() => setPage(cur + 1)} disabled={cur === pages}
                style={{ ...smallBtn, opacity: cur === pages ? 0.4 : 1 }}>NEXT ›</button>
            </div>
          )}
          {syncError && <div style={{ fontSize: 12, marginTop: 10, color: 'var(--cp-red)' }}>{syncError}</div>}
        </div>
      )}

      <div className="cp-divider" style={{ margin: '18px 0' }} />

      <CloudView />
      </>
      )}
      </div>
    </div>
  )
}
