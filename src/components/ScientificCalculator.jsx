import React, { useState, useEffect, useRef } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { haptic } from '../utils/haptic'
import { evaluate } from '../utils/mathEval'
import { convert, UNIT_CATEGORIES } from '../utils/units'

const BTN = {
  base: { fontFamily: 'var(--cb-font-mono)', fontWeight: 700, border: '1px solid var(--cp-border)',
    borderRadius: 6, cursor: 'pointer', padding: '14px 0', transition: 'all 0.1s', userSelect: 'none' },
  num:  { fontSize: 19, background: 'var(--cp-bg3)',    color: 'var(--cp-txt)',    borderColor: 'var(--cp-border2)' },
  sci:  { fontSize: 13, background: 'var(--cp-bg2)',    color: 'var(--cp-acc2)',   borderColor: 'var(--cp-border)'  },
  op:   { fontSize: 19, background: 'var(--cp-accdim)', color: 'var(--cp-acc)',    borderColor: 'var(--cp-border)'  },
  util: { fontSize: 17, background: 'var(--cp-bg2)',    color: 'var(--cp-muted)',  borderColor: 'var(--cp-border)'  },
  clr:  { fontSize: 14, background: 'rgba(239,68,68,0.12)',   color: 'var(--cp-red)',    borderColor: 'rgba(239,68,68,0.4)'  },
  eq:   { fontSize: 22, background: 'rgba(34,197,94,0.12)',   color: 'var(--cp-green)',  borderColor: 'rgba(34,197,94,0.4)'  },
  pi:   { fontSize: 14, background: 'rgba(167,139,250,0.12)', color: 'var(--cp-purple)', borderColor: 'rgba(167,139,250,0.4)' },
}

function Btn({ style, children, onClick, colSpan, hapticType = 'light' }) {
  const [hover, setHover] = useState(false)
  const [pressed, setPressed] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false) }}
      onPointerDown={() => { setPressed(true); haptic(hapticType) }}
      onPointerUp={() => setPressed(false)}
      style={{ ...BTN.base, ...style, opacity: pressed ? 0.65 : hover ? 0.85 : 1,
        transform: pressed ? 'scale(0.91)' : hover ? 'scale(0.97)' : 'scale(1)',
        gridColumn: colSpan ? `span ${colSpan}` : undefined }}>{children}</button>
  )
}

const fmt = v => (!isFinite(v) || isNaN(v)) ? 'Error' : parseFloat(v.toPrecision(10)).toString()
const selStyle = {
  background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)', borderRadius: 6,
  color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)', fontSize: 13, padding: '9px 10px',
  outline: 'none', cursor: 'pointer', width: '100%',
}

export default function ScientificCalculator() {
  const { scientific, setScientificDisplay } = useCalculatorStore()
  const d = scientific.display

  const [angle, setAngle] = useState('deg')   // 'deg' | 'rad'
  const [mem, setMem]     = useState(0)
  const [ans, setAns]     = useState(0)
  const [mode, setMode]   = useState('calc')  // 'calc' | 'convert'

  const terminal = d === '0' || d === 'Error'
  const insert = s => setScientificDisplay(terminal ? s : d + s)
  const clear  = () => setScientificDisplay('0')
  const back   = () => setScientificDisplay(d.length <= 1 || d === 'Error' ? '0' : d.slice(0, -1))

  const equals = () => {
    try { const r = evaluate(d, angle); setAns(r); setScientificDisplay(fmt(r)) }
    catch { setScientificDisplay('Error') }
  }
  const memAdd = (sign) => { try { setMem(m => m + sign * evaluate(d, angle)) } catch { /* noop */ } }

  // Keyboard
  const ref = useRef({}); ref.current = { insert, equals, back, clear }
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const h = ref.current, k = e.key
      if (k >= '0' && k <= '9') h.insert(k)
      else if (k === '.') h.insert('.')
      else if (k === '+') h.insert('+')
      else if (k === '-') h.insert('-')
      else if (k === '*') h.insert('×')
      else if (k === '/') { e.preventDefault(); h.insert('÷') }
      else if (k === '^') h.insert('^')
      else if (k === '(' || k === ')') h.insert(k)
      else if (k === 'Enter' || k === '=') { e.preventDefault(); h.equals() }
      else if (k === 'Backspace') h.back()
      else if (k === 'Escape') h.clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── CONVERT mode ──
  if (mode === 'convert') {
    return <Converter onBack={() => setMode('calc')} />
  }

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 9 }}>

      {/* mode toggle */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[['calc', 'CALC'], ['convert', 'CONVERT']].map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)} style={{
            flex: 1, fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.14em',
            padding: '8px 0', borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${mode === id ? 'var(--cp-acc)' : 'var(--cp-border2)'}`,
            background: mode === id ? 'var(--cp-accdim)' : 'transparent',
            color: mode === id ? 'var(--cp-acc)' : 'var(--cp-dim)' }}>{label}</button>
        ))}
      </div>

      {/* display */}
      <div style={{ background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)',
        borderRadius: 6, padding: '14px 18px 16px', textAlign: 'right' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9,
          color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)', letterSpacing: '0.1em', marginBottom: 6 }}>
          <span style={{ display: 'flex', gap: 8 }}>
            <span style={{ color: 'var(--cp-acc)' }}>{angle.toUpperCase()}</span>
            {mem !== 0 && <span>M</span>}
          </span>
          <span>ANS {fmt(ans)}</span>
        </div>
        <div style={{ color: 'var(--cp-acc)', fontWeight: 700, fontFamily: 'var(--cb-font-mono)',
          fontSize: d.length > 20 ? '1.2rem' : d.length > 14 ? '1.7rem' : '2.4rem',
          lineHeight: 1.1, letterSpacing: '0.02em', overflowWrap: 'break-word', wordBreak: 'break-all' }}>
          {d}
        </div>
      </div>

      {/* controls: angle + memory */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 7 }}>
        <Btn style={BTN.util} onClick={() => setAngle(a => a === 'deg' ? 'rad' : 'deg')}>{angle === 'deg' ? 'RAD' : 'DEG'}</Btn>
        <Btn style={BTN.util} onClick={() => setMem(0)}>MC</Btn>
        <Btn style={BTN.util} onClick={() => memAdd(1)}>M+</Btn>
        <Btn style={BTN.util} onClick={() => memAdd(-1)}>M−</Btn>
        <Btn style={BTN.util} onClick={() => insert(fmt(mem))}>MR</Btn>
      </div>

      {/* scientific functions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 7 }}>
        <Btn style={BTN.sci} onClick={() => insert('sin(')}>sin</Btn>
        <Btn style={BTN.sci} onClick={() => insert('cos(')}>cos</Btn>
        <Btn style={BTN.sci} onClick={() => insert('tan(')}>tan</Btn>
        <Btn style={BTN.sci} onClick={() => insert('asin(')}>sin⁻¹</Btn>
        <Btn style={BTN.sci} onClick={() => insert('acos(')}>cos⁻¹</Btn>
        <Btn style={BTN.sci} onClick={() => insert('atan(')}>tan⁻¹</Btn>

        <Btn style={BTN.sci} onClick={() => insert('log(')}>log</Btn>
        <Btn style={BTN.sci} onClick={() => insert('ln(')}>ln</Btn>
        <Btn style={BTN.sci} onClick={() => insert('√(')}>√</Btn>
        <Btn style={BTN.sci} onClick={() => insert('^2')}>x²</Btn>
        <Btn style={BTN.sci} onClick={() => insert('^')}>xʸ</Btn>
        <Btn style={BTN.sci} onClick={() => insert('^-1')}>1/x</Btn>

        <Btn style={BTN.sci} onClick={() => insert('(')}>(</Btn>
        <Btn style={BTN.sci} onClick={() => insert(')')}>)</Btn>
        <Btn style={BTN.pi}  onClick={() => insert('π')}>π</Btn>
        <Btn style={BTN.sci} onClick={() => insert('e')}>e</Btn>
        <Btn style={BTN.sci} onClick={() => insert(fmt(ans))}>Ans</Btn>
        <Btn style={BTN.util} onClick={back}>⌫</Btn>
      </div>

      {/* numpad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
        {[7, 8, 9].map(n => <Btn key={n} style={BTN.num} onClick={() => insert(String(n))}>{n}</Btn>)}
        <Btn style={BTN.op} onClick={() => insert('÷')}>÷</Btn>
        {[4, 5, 6].map(n => <Btn key={n} style={BTN.num} onClick={() => insert(String(n))}>{n}</Btn>)}
        <Btn style={BTN.op} onClick={() => insert('×')}>×</Btn>
        {[1, 2, 3].map(n => <Btn key={n} style={BTN.num} onClick={() => insert(String(n))}>{n}</Btn>)}
        <Btn style={BTN.op} onClick={() => insert('-')}>−</Btn>
        <Btn style={BTN.clr} onClick={clear}>C</Btn>
        <Btn style={BTN.num} onClick={() => insert('0')}>0</Btn>
        <Btn style={BTN.num} onClick={() => insert('.')}>.</Btn>
        <Btn style={BTN.op} onClick={() => insert('+')}>+</Btn>
      </div>

      <Btn style={{ ...BTN.eq, ...BTN.base, padding: '20px 0' }} onClick={equals} hapticType="heavy">=</Btn>
    </div>
  )
}

// ── Unit converter ────────────────────────────────────────────────────────────
function Converter({ onBack }) {
  const cats = Object.keys(UNIT_CATEGORIES)
  const [cat, setCat] = useState('length')
  const units = Object.keys(UNIT_CATEGORIES[cat].units)
  const [from, setFrom] = useState(units[0])
  const [to, setTo]     = useState(units[1] || units[0])
  const [val, setVal]   = useState('')

  const pickCat = (c) => {
    const u = Object.keys(UNIT_CATEGORIES[c].units)
    setCat(c); setFrom(u[0]); setTo(u[1] || u[0])
  }
  const out = convert(cat, val, from, to)
  const swap = () => { setFrom(to); setTo(from) }

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[['calc', 'CALC'], ['convert', 'CONVERT']].map(([id, label]) => (
          <button key={id} onClick={() => id === 'calc' && onBack()} style={{
            flex: 1, fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.14em',
            padding: '8px 0', borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${id === 'convert' ? 'var(--cp-acc)' : 'var(--cp-border2)'}`,
            background: id === 'convert' ? 'var(--cp-accdim)' : 'transparent',
            color: id === 'convert' ? 'var(--cp-acc)' : 'var(--cp-dim)' }}>{label}</button>
        ))}
      </div>

      {/* category */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cats.length}, 1fr)`, gap: 6 }}>
        {cats.map(c => (
          <button key={c} onClick={() => pickCat(c)} style={{
            fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.08em', padding: '8px 0',
            borderRadius: 6, cursor: 'pointer',
            border: `1px solid ${cat === c ? 'var(--cp-acc)' : 'var(--cp-border2)'}`,
            background: cat === c ? 'var(--cp-accdim)' : 'transparent',
            color: cat === c ? 'var(--cp-acc)' : 'var(--cp-dim)' }}>
            {UNIT_CATEGORIES[c].label.toUpperCase()}
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

      {/* result */}
      <div style={{ background: 'var(--cp-bg3)', border: '1px solid var(--cp-border2)',
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
