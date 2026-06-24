import { useState } from 'react'
import { convert, UNIT_CATEGORIES, convertFuel, FUEL_MASS_UNITS, FUEL_VOLUME_UNITS } from '../utils/units'

const selStyle = {
  background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)', borderRadius: 6,
  color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)', fontSize: 13, padding: '9px 10px',
  outline: 'none', cursor: 'pointer', width: '100%',
}

const FUEL_UNITS = { ...FUEL_MASS_UNITS, ...FUEL_VOLUME_UNITS }

export default function Converter() {
  const cats = [...Object.keys(UNIT_CATEGORIES), 'fuel']
  const [cat, setCat] = useState('length')
  const isFuel = cat === 'fuel'
  const units = isFuel ? Object.keys(FUEL_UNITS) : Object.keys(UNIT_CATEGORIES[cat].units)
  const [from, setFrom] = useState(units[0])
  const [to, setTo]     = useState(units[1] || units[0])
  const [val, setVal]   = useState('')
  const [density, setDensity] = useState('')

  const pickCat = (c) => {
    const u = c === 'fuel' ? Object.keys(FUEL_UNITS) : Object.keys(UNIT_CATEGORIES[c].units)
    setCat(c); setFrom(u[0]); setTo(u[1] || u[0])
  }

  const crossDomain = isFuel && (from in FUEL_MASS_UNITS) !== (to in FUEL_MASS_UNITS)
  const out = isFuel ? convertFuel(val, from, to, density) : convert(cat, val, from, to)
  const swap = () => { setFrom(to); setTo(from) }

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* category */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cats.length, 4)}, 1fr)`, gap: 6 }}>
        {cats.map(c => (
          <button key={c} onClick={() => pickCat(c)} style={{
            fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.08em', padding: '8px 0',
            borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${cat === c ? 'var(--cp-acc)' : 'var(--cp-border2)'}`,
            background: cat === c ? 'var(--cp-accdim)' : 'transparent',
            color: cat === c ? 'var(--cp-acc)' : 'var(--cp-dim)' }}>
            {c === 'fuel' ? 'FUEL' : UNIT_CATEGORIES[c].label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* value */}
      <div>
        <div className="cp-label" style={{ marginBottom: 5 }}>VALUE</div>
        <input className="cp-input" type="number" inputMode="decimal" value={val}
          onChange={e => setVal(e.target.value)} placeholder="0"
          style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 18 }} />
      </div>

      {/* from / to */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'end' }}>
        <div>
          <div className="cp-label" style={{ marginBottom: 5 }}>FROM</div>
          <select value={from} onChange={e => setFrom(e.target.value)} style={selStyle}>
            {units.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <button onClick={swap} style={{ background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)',
          borderRadius: 6, color: 'var(--cp-acc)', fontSize: 16, cursor: 'pointer', padding: '9px 12px' }}>⇄</button>
        <div>
          <div className="cp-label" style={{ marginBottom: 5 }}>TO</div>
          <select value={to} onChange={e => setTo(e.target.value)} style={selStyle}>
            {units.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {/* fuel density input — only needed when converting mass ↔ volume */}
      {crossDomain && (
        <div>
          <div className="cp-label" style={{ marginBottom: 5 }}>DENSITY (kg/L)</div>
          <input className="cp-input" type="number" inputMode="decimal" value={density}
            onChange={e => setDensity(e.target.value)} placeholder="e.g. 0.8 for Jet A-1"
            style={{ fontFamily: 'var(--cb-font-mono)', fontSize: 16 }} />
        </div>
      )}

      {/* result */}
      <div className="cp-card-bg3" style={{ border: '1px solid var(--cp-border2)',
        borderLeft: `3px solid ${out != null ? 'var(--cp-acc)' : 'var(--cp-border2)'}`,
        borderRadius: 6, padding: '16px 18px' }}>
        <div className="cp-label" style={{ marginBottom: 6 }}>RESULT</div>
        <div style={{ fontFamily: 'var(--cb-font-mono)', fontWeight: 700, fontSize: 28,
          color: out != null ? 'var(--cp-acc)' : 'var(--cp-dim)', lineHeight: 1 }}>
          {out != null ? `${parseFloat(out.toPrecision(8))} ${to}` : '—'}
        </div>
      </div>
    </div>
  )
}
