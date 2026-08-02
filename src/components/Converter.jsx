import { useState } from 'react'
import { convert, UNIT_CATEGORIES, convertFuel, FUEL_MASS_UNITS, FUEL_VOLUME_UNITS } from '../utils/units'

const FUEL_UNITS = { ...FUEL_MASS_UNITS, ...FUEL_VOLUME_UNITS }

const CATEGORY_ICONS = {
  length: '📏', speed: '💨', mass: '⚖️', temp: '🌡️',
  volume: '🧪', area: '📐', pressure: '🌀', fuel: '⛽',
}

function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return null
  return String(parseFloat(n.toPrecision(8)))
}

function UnitPicker({ value, options, open, onToggle, onPick }) {
  return (
    <div>
      <button type="button" onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--cp-bginput)', border: `1px solid ${open ? 'var(--cp-acc)' : 'var(--cp-border)'}`,
        borderRadius: 6, color: open ? 'var(--cp-acc)' : 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)',
        fontSize: 14, fontWeight: 700, padding: '9px 12px', cursor: 'pointer',
      }}>
        {value}
        <span style={{ fontSize: 10, opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {open && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, padding: 10,
          background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)', borderRadius: 6,
        }}>
          {options.map(u => (
            <button key={u} type="button" onClick={() => onPick(u)} style={{
              fontFamily: 'var(--cb-font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
              padding: '7px 12px', borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${u === value ? 'var(--cp-acc)' : 'var(--cp-border)'}`,
              background: u === value ? 'var(--cp-accdim)' : 'var(--cp-bginput)',
              color: u === value ? 'var(--cp-acc)' : 'var(--cp-dim)',
            }}>{u}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Converter() {
  const cats = [...Object.keys(UNIT_CATEGORIES), 'fuel']
  const [cat, setCat] = useState('length')
  const isFuel = cat === 'fuel'
  const units = isFuel ? Object.keys(FUEL_UNITS) : Object.keys(UNIT_CATEGORIES[cat].units)
  const [from, setFrom] = useState(units[0])
  const [to, setTo]     = useState(units[1] || units[0])
  const [fromVal, setFromVal] = useState('1')
  const [toVal, setToVal]     = useState('')
  const [driver, setDriver]   = useState('from')
  const [density, setDensity] = useState('')
  const [openPanel, setOpenPanel] = useState(null) // 'from' | 'to' | null

  const pickCat = (c) => {
    const u = c === 'fuel' ? Object.keys(FUEL_UNITS) : Object.keys(UNIT_CATEGORIES[c].units)
    setCat(c); setFrom(u[0]); setTo(u[1] || u[0])
    setDriver('from'); setFromVal('1'); setToVal(''); setOpenPanel(null)
  }

  const doConvert = (value, fromUnit, toUnit) =>
    isFuel ? convertFuel(value, fromUnit, toUnit, density) : convert(cat, value, fromUnit, toUnit)

  const crossDomain = isFuel && (from in FUEL_MASS_UNITS) !== (to in FUEL_MASS_UNITS)

  // Only the side the user is actively typing into keeps its raw text — the
  // other side is always derived from it, so there's a single source of truth.
  const computedTo   = driver === 'from' ? fmtNum(doConvert(fromVal, from, to)) : null
  const computedFrom = driver === 'to'   ? fmtNum(doConvert(toVal, to, from))   : null
  const shownFromVal = driver === 'from' ? fromVal : (computedFrom ?? '')
  const shownToVal   = driver === 'to'   ? toVal   : (computedTo   ?? '')

  const swap = () => {
    setFrom(to); setTo(from)
    setFromVal(shownToVal); setDriver('from')
  }

  const twinCard = (side) => {
    const isDriver = driver === side
    const value = side === 'from' ? shownFromVal : shownToVal
    const unit  = side === 'from' ? from : to
    return (
      <div className="cp-card-bg3" style={{
        border: `1px solid ${isDriver ? 'var(--cp-border2)' : 'rgba(var(--cp-acc-rgb,63,224,197),0.35)'}`,
        borderRadius: 8, padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="cp-label">{side === 'from' ? 'FROM' : 'TO'}</span>
          {!isDriver && (
            <span style={{
              fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.12em',
              padding: '2px 7px', borderRadius: 10, background: 'var(--cp-accdim)', color: 'var(--cp-acc)',
            }}>LIVE</span>
          )}
        </div>
        <input type="number" inputMode="decimal" placeholder="0" value={value}
          onChange={e => {
            setDriver(side)
            if (side === 'from') setFromVal(e.target.value); else setToVal(e.target.value)
          }}
          style={{
            width: '100%', background: 'transparent', border: 'none', outline: 'none', padding: 0,
            fontFamily: 'var(--cb-font-mono)', fontWeight: 700, fontSize: 24,
            color: isDriver ? 'var(--cp-txt)' : 'var(--cp-acc)',
          }} />
        <div style={{ marginTop: 8 }}>
          <UnitPicker
            value={unit}
            options={units}
            open={openPanel === side}
            onToggle={() => setOpenPanel(p => (p === side ? null : side))}
            onPick={u => { side === 'from' ? setFrom(u) : setTo(u); setOpenPanel(null) }}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* category */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cats.length, 4)}, 1fr)`, gap: 6 }}>
        {cats.map(c => (
          <button key={c} onClick={() => pickCat(c)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            fontFamily: 'var(--cb-font-mono)', fontSize: 9, letterSpacing: '0.06em', padding: '8px 2px',
            borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${cat === c ? 'var(--cp-acc)' : 'var(--cp-border2)'}`,
            background: cat === c ? 'var(--cp-accdim)' : 'transparent',
            color: cat === c ? 'var(--cp-acc)' : 'var(--cp-dim)' }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{CATEGORY_ICONS[c]}</span>
            {c === 'fuel' ? 'FUEL' : UNIT_CATEGORIES[c].label.toUpperCase()}
          </button>
        ))}
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

      {/* bidirectional from/to */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <div style={{ width: '100%' }}>{twinCard('from')}</div>
        <button onClick={swap} style={{ background: 'var(--cp-bg2)', border: '1px solid var(--cp-border)',
          borderRadius: 6, color: 'var(--cp-acc)', fontSize: 16, cursor: 'pointer', padding: '8px 12px',
          margin: '-2px 0' }}>⇄</button>
        <div style={{ width: '100%' }}>{twinCard('to')}</div>
      </div>
    </div>
  )
}
