import { useMemo } from 'react'
import { parseRoute, MAX_FIXES } from '../utils/routeParse'

// Optional ROUTE box shared by the METAR/TAF, NOTAM and SIGMET tabs. The pilot
// pastes the route copied from FDPro/eWAS; a readable route fills this tab's
// Departure and Arrival, and Briefing draws it on the Dark map.
// `dep`/`arr` are the tab's current airport boxes, to warn when they disagree.
export default function RouteInput({ value, onChange, onAirports, dep, arr }) {
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
  } else {
    note = { warn: false, text: `${parsed.dep} → ${parsed.arr} · ${parsed.fixes.length} fix${parsed.fixes.length === 1 ? '' : 'es'}` }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="cp-label" style={{ marginBottom: 4 }}>ROUTE (OPTIONAL)</div>
      <textarea
        className="cp-input"
        rows={2}
        value={value}
        onChange={handleChange}
        placeholder="e.g. WMKK KIMAT1A KIMAT Y344 VPK … RCQC"
        autoCapitalize="characters" autoCorrect="off" spellCheck={false}
        aria-label="Route"
        style={{ fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.06em', resize: 'vertical', minHeight: 52 }}
      />
      <div style={{ fontSize: 11, marginTop: 4, color: note.warn ? 'var(--cp-yellow)' : 'var(--cp-dim)' }}>
        {note.text}
      </div>
    </div>
  )
}
