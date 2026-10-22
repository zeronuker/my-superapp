import { addEnroute, removeEnroute } from '../utils/enrouteAlts'

// Enroute Alternates section shared by the METAR/TAF, NOTAM and SIGMET tabs:
// "+ ADD" (same look as the Duty Log's "+ NEW") adds a field, the red × inside a
// field removes it. State is { count, alts } — see utils/enrouteAlts.js.
// `clean` shapes what is typed (default: upper-case); `onEnter` runs on the Enter key.
export default function EnrouteAlternates({ count, alts, max, onChange, inputStyle, onEnter, clean = v => v.toUpperCase() }) {
  const atMax = count >= max

  return (
    <>
      <div className="cp-section-header">
        <span className="cp-section-title">Enroute Alternates</span>
        <div className="cp-divider" />
        <button type="button" className="cp-btn"
          onClick={() => onChange(addEnroute(count, alts, max))}
          disabled={atMax}
          aria-label="Add enroute alternate"
          title={atMax ? `Maximum of ${max} alternates` : 'Add an enroute alternate'}
          style={{
            color: 'var(--cp-acc)', borderColor: 'var(--cp-acc)', background: 'var(--cp-accdim)',
            display: 'inline-flex', alignItems: 'center', gap: 5, letterSpacing: '0.1em',
            opacity: atMax ? 0.4 : 1, cursor: atMax ? 'not-allowed' : 'pointer',
          }}>+ ADD</button>
      </div>

      {count > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {Array.from({ length: count }, (_, i) => (
            <div key={i}>
              <div className="cp-label" style={{ marginBottom: 4 }}>ERA {i + 1}</div>
              <div style={{ position: 'relative' }}>
                <input className="cp-input" style={{ ...inputStyle, paddingRight: 34 }}
                  placeholder="ICAO" value={alts[i] || ''} maxLength={4}
                  onChange={e => onChange({ count, alts: alts.map((a, k) => (k === i ? clean(e.target.value) : a)) })}
                  onKeyDown={onEnter ? (e => e.key === 'Enter' && onEnter()) : undefined} />
                <button type="button"
                  onClick={() => onChange(removeEnroute(count, alts, i))}
                  aria-label={`Delete enroute alternate ${i + 1}`}
                  title="Delete"
                  style={{
                    position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--cp-red)', cursor: 'pointer',
                    fontSize: 16, lineHeight: 1, padding: '4px 6px',
                  }}>×</button>
              </div>
            </div>
          ))}
        </div>
      ) : <div style={{ marginBottom: 20 }} />}
    </>
  )
}
