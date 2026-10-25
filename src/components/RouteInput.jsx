import { useMemo } from 'react'
import { parseRoute, MAX_FIXES } from '../utils/routeParse'

// Optional ROUTE box on the Briefing screen's manual form. The pilot pastes the
// route copied from FDPro/eWAS; a readable route fills Departure and Arrival,
// and Briefing draws it on the Dark map. A route that came from an imported OFP
// is shown as the route as filed (`label`) with CLEAR instead of its coordinate text.
// `dep`/`arr` are the form's current airport boxes, to warn when they disagree.
export default function RouteInput({ value, onChange, onAirports, dep, arr, label }) {
  const parsed = useMemo(() => parseRoute(value), [value])

  const handleChange = (e) => {
    const text = e.target.value
    onChange(text)
    const p = parseRoute(text)
    if (p.ok) onAirports(p.dep, p.arr)
  }

  let note = null
  if (!value.trim()) {
    note = { warn: false, text: 'Optional. Paste the route from FDPro or eWAS to draw it on the Briefing map.' }
  } else if (parsed.tooLong) {
    note = { warn: true, text: `Too many fixes (maximum ${MAX_FIXES}).` }
  } else if (!parsed.ok) {
    note = { warn: true, text: 'Start and end the route with airport codes, e.g. WMKK … RCQC.' }
  } else if ((dep || '') !== parsed.dep || (arr || '') !== parsed.arr) {
    note = { warn: true, text: `This route is ${parsed.dep} → ${parsed.arr}, but Departure/Arrival above differ, so it will not be drawn.` }
  } else if (parsed.pts) {
    note = null   // the summary row above already says it
  } else {
    note = { warn: false, text: `${parsed.dep} → ${parsed.arr} · ${parsed.fixes.length} fix${parsed.fixes.length === 1 ? '' : 'es'}` }
  }

  const mono = { fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.06em' }

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="cp-label" style={{ marginBottom: 4 }}>ROUTE (OPTIONAL)</div>
      {parsed.pts ? (
        <div className="cp-input" style={{ ...mono, height: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, minHeight: 52 }}>
          <div style={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.5 }}>
            <div>{label || `${parsed.dep} → ${parsed.arr}`}</div>
            <div style={{ color: 'var(--cp-dim)', fontSize: 11, marginTop: 3 }}>OFP route · {parsed.pts.length} points</div>
          </div>
          <button className="cp-btn" onClick={() => onChange('')}
            style={{ padding: '6px 10px', fontSize: 10, borderRadius: 6, letterSpacing: '0.16em', flexShrink: 0 }}>CLEAR</button>
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
      {note && (
        <div style={{ fontSize: 11, marginTop: 4, color: note.warn ? 'var(--cp-yellow)' : 'var(--cp-dim)' }}>
          {note.text}
        </div>
      )}
    </div>
  )
}
