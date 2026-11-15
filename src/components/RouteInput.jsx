import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { parseRoute, MAX_FIXES } from '../utils/routeParse'
import { parseFplBlock, parseEnrouteAlts } from '../utils/ofpParse'

// The ONE paste box on the Briefing screen's manual form. The pilot pastes either the OFP's ICAO flight plan
// block "(FPL-…)" (with or without the Flight Remarks under it, in one go or one after the other) or just a
// route copied from FDPro/eWAS. The parent (`onChange`) fills the form from whatever was found; this box
// grows to show everything that was pasted and says what it read. A route that came from an imported OFP is
// shown as the route as filed (`label`) with CLEAR instead of its coordinate text.
// `dep`/`arr` are the form's current airport boxes, to warn when they disagree; `known` is every airport
// already in the form (departure, arrival, destination alternates), left out of pasted enroute alternates.
export default function RouteInput({ value, onChange, dep, arr, known = [], label }) {
  const fpl = useMemo(() => parseFplBlock(value), [value])
  const parsed = useMemo(() => parseRoute(fpl.ok ? fpl.routeText : value), [fpl, value])
  // Remarks pasted on their own (no flight plan yet).
  const remarks = useMemo(() => (fpl.ok ? null : parseEnrouteAlts(value, known)), [fpl, value, known.join('|')])  // eslint-disable-line react-hooks/exhaustive-deps

  // Grows (and shrinks) with the text so none of it is hidden.
  const ref = useRef(null)
  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }
  useLayoutEffect(fit, [value, parsed.pts])
  useEffect(() => {
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`
  let note = null
  if (!value.trim()) {
    note = { text: 'Optional. Paste the (FPL-…) block and the Flight Remarks from your OFP, or a route from FDPro or eWAS.' }
  } else if (fpl.ok) {
    const alts = [fpl.destAlts.alt1, fpl.destAlts.alt2].filter(Boolean).join('/')
    const bits = [
      `${fpl.dep} → ${fpl.arr}`,
      alts && `alt ${alts}`,
      fpl.enroute && n(fpl.enroute.length, 'enroute alt', 'enroute alts'),
      fpl.firs.length > 0 && n(fpl.firs.length, 'FIR', 'FIRs'),
      parsed.fixes.length > 0 && n(parsed.fixes.length, 'fix', 'fixes'),
    ].filter(Boolean)
    if ((dep || '') !== fpl.dep || (arr || '') !== fpl.arr) {
      note = { warn: true, text: `This flight plan is ${fpl.dep} → ${fpl.arr}, but Departure/Arrival below differ, so its route will not be drawn.` }
    } else {
      note = { ok: true, text: `✓ Read ${bits.join(' · ')}. Check below.${fpl.enroute ? '' : ' No ENROUTE ALT line yet: paste the Flight Remarks to add enroute alternates.'}` }
    }
  } else if (/\(FPL-/i.test(value)) {
    note = { warn: true, text: "Couldn't read the flight plan. Paste the whole (FPL-…) block, from \"(FPL-\" to the closing \")\"." }
  } else if (remarks) {
    note = remarks.length
      ? { ok: true, text: `✓ Read ${n(remarks.length, 'enroute alternate', 'enroute alternates')}. Paste the (FPL-…) block too to fill the rest.` }
      : { text: 'The ENROUTE ALT line names no new airport. Paste the (FPL-…) block to fill the rest.' }
  } else if (parsed.tooLong) {
    note = { warn: true, text: `Too many fixes (maximum ${MAX_FIXES}).` }
  } else if (!parsed.ok) {
    note = { warn: true, text: 'Not recognised. Paste the (FPL-…) block, or a route that starts and ends with airport codes, e.g. WMKK … RCQC.' }
  } else if ((dep || '') !== parsed.dep || (arr || '') !== parsed.arr) {
    note = { warn: true, text: `This route is ${parsed.dep} → ${parsed.arr}, but Departure/Arrival below differ, so it will not be drawn.` }
  } else if (parsed.pts) {
    note = null   // the summary row above already says it
  } else {
    note = { text: `${parsed.dep} → ${parsed.arr} · ${n(parsed.fixes.length, 'fix', 'fixes')}` }
  }

  const mono = { fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.06em' }

  return (
    <div style={{ marginBottom: 20 }}>
      {parsed.pts && !fpl.ok ? (
        <div className="cp-input" style={{ ...mono, height: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, minHeight: 52 }}>
          <div style={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.5 }}>
            <div>{label || `${parsed.dep} → ${parsed.arr}`}</div>
            {!label && <div style={{ color: 'var(--cp-dim)', fontSize: 11, marginTop: 3 }}>OFP route</div>}
          </div>
          <button className="cp-btn" onClick={() => onChange('')}
            style={{ padding: '6px 10px', fontSize: 10, borderRadius: 6, letterSpacing: '0.16em', flexShrink: 0 }}>CLEAR</button>
        </div>
      ) : (
        <textarea
          ref={ref}
          className="cp-input"
          rows={3}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={'Paste the (FPL-…) block and the Flight Remarks,\nor just a route:  WMKK KIMAT1A KIMAT Y344 … RCQC'}
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          aria-label="Flight plan or route"
          style={{ ...mono, width: '100%', boxSizing: 'border-box', resize: 'none', overflow: 'hidden', minHeight: 76, fontSize: 12, lineHeight: 1.5 }}
        />
      )}
      {note && (
        <div role="status" style={{ fontSize: 11, marginTop: 4, color: note.warn ? 'var(--cp-yellow)' : note.ok ? 'var(--cp-green)' : 'var(--cp-dim)' }}>
          {note.text}
        </div>
      )}
    </div>
  )
}
