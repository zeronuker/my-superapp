import { useMemo, useRef, useState } from 'react'
import { parseRoute, MAX_FIXES } from '../utils/routeParse'
import { ofpToFields } from '../utils/ofpParse'
import { readOfpFile } from '../services/ofpFile'

// Optional ROUTE box shared by the METAR/TAF, NOTAM and SIGMET tabs. The pilot
// pastes the route copied from FDPro/eWAS; a readable route fills this tab's
// Departure and Arrival, and Briefing draws it on the Dark map.
// Or imports the OFP file (XmlOFP or PFP PDF): a card shows what was read, and
// `onOfp(fields, openBriefing)` fills the tab's boxes — plus opens Briefing on Yes.
// `dep`/`arr` are the tab's current airport boxes, to warn when they disagree.
export default function RouteInput({ value, onChange, onAirports, onOfp, dep, arr }) {
  const parsed = useMemo(() => parseRoute(value), [value])
  const fileRef = useRef(null)
  const [ofp, setOfp] = useState(null)
  const [ofpError, setOfpError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleChange = (e) => {
    const text = e.target.value
    onChange(text)
    const p = parseRoute(text)
    if (p.ok) onAirports(p.dep, p.arr)
  }

  const pickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''   // lets the same file be chosen again
    if (!file) return
    setBusy(true); setOfp(null); setOfpError('')
    const r = await readOfpFile(file)
    setBusy(false)
    if (r.ok) setOfp(r)
    else setOfpError(r.error)
  }

  const accept = (openBriefing) => {
    onOfp(ofpToFields(ofp), openBriefing)
    setOfp(null)
  }

  let note = null
  if (!value.trim()) {
    note = { warn: false, text: 'Optional. Paste the route from FDPro or eWAS, or import the OFP, to draw it on the Briefing map.' }
  } else if (parsed.tooLong) {
    note = { warn: true, text: `Too many fixes (maximum ${MAX_FIXES}).` }
  } else if (!parsed.ok) {
    note = { warn: true, text: 'Start and end the route with airport codes, e.g. WMKK … RCQC.' }
  } else if ((dep || '') !== parsed.dep || (arr || '') !== parsed.arr) {
    note = { warn: true, text: `This route is ${parsed.dep} → ${parsed.arr}, but Departure/Arrival above differ, so it will not be drawn.` }
  } else if (parsed.pts) {
    note = { warn: false, text: `${parsed.dep} → ${parsed.arr} · OFP route · ${parsed.pts.length} points` }
  } else {
    note = { warn: false, text: `${parsed.dep} → ${parsed.arr} · ${parsed.fixes.length} fix${parsed.fixes.length === 1 ? '' : 'es'}` }
  }

  const mono = { fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.06em' }
  const btn = { padding: '6px 10px', fontSize: 10, borderRadius: 6, letterSpacing: '0.16em' }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div className="cp-label">ROUTE (OPTIONAL)</div>
        <button className="cp-btn" style={btn} disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'READING…' : '⇪  IMPORT OFP'}
        </button>
        <input ref={fileRef} type="file" accept=".txt,.xml,.pdf,application/pdf,text/plain,text/xml"
          onChange={pickFile} style={{ display: 'none' }} aria-label="Import OFP file" />
      </div>

      {ofp && (
        <div style={{ border: '1px solid var(--cp-border3)', borderRadius: 6, padding: 12, marginBottom: 10 }}>
          <div className="cp-label" style={{ marginBottom: 6 }}>OFP FOUND</div>
          <div style={{ ...mono, fontSize: 13, marginBottom: 6 }}>{ofp.flight} · {ofp.dep} → {ofp.arr}</div>
          <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
            <div>Destination alternates: <span style={mono}>{ofp.destAlts.join(', ') || 'none'}</span></div>
            <div>Enroute alternates: <span style={mono}>{ofp.enrouteAlts.join(', ') || 'none'}</span></div>
            <div>Route: {ofp.points.length} points</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="cp-btn" onClick={() => accept(true)} style={{ ...btn,
              border: '2px solid var(--cp-green)', color: 'var(--cp-green)',
              background: 'color-mix(in srgb, var(--cp-green) 18%, transparent)' }}>YES · OPEN BRIEFING</button>
            <button className="cp-btn" onClick={() => accept(false)} style={btn}>NO · LET ME EDIT</button>
            <button className="cp-btn" onClick={() => setOfp(null)} style={{ ...btn, opacity: 0.7 }}>CANCEL</button>
          </div>
        </div>
      )}
      {ofpError && <div style={{ fontSize: 11, marginBottom: 8, color: 'var(--cp-yellow)' }}>{ofpError}</div>}

      {parsed.pts ? (
        <div className="cp-input" style={{ ...mono, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 52 }}>
          <span>{parsed.dep} → {parsed.arr} · OFP route · {parsed.pts.length} points</span>
          <button className="cp-btn" style={btn} onClick={() => onChange('')}>CLEAR</button>
        </div>
      ) : (
        <textarea
          className="cp-input"
          rows={2}
          value={value}
          onChange={handleChange}
          placeholder="e.g. WMKK KIMAT1A KIMAT Y344 VPK … RCQC"
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          aria-label="Route"
          style={{ ...mono, resize: 'vertical', minHeight: 52 }}
        />
      )}
      <div style={{ fontSize: 11, marginTop: 4, color: note.warn ? 'var(--cp-yellow)' : 'var(--cp-dim)' }}>
        {note.text}
      </div>
    </div>
  )
}
