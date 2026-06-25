import React, { useState, useEffect, useRef } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { evaluate } from '../utils/mathEval'
import CalcButton from './CalcButton'

const BTN = {
  base: { fontFamily: 'var(--cb-font-mono)', fontWeight: 700, border: '1px solid var(--cp-border)',
    borderRadius: 6, cursor: 'pointer', padding: 'clamp(9px, 1.2vh, 14px) 0', transition: 'all 0.1s', userSelect: 'none' },
  num:  { fontSize: 19, background: 'var(--cp-bg3)',    color: 'var(--cp-txt)',    borderColor: 'var(--cp-border2)' },
  sci:  { fontSize: 13, background: 'var(--cp-bg2)',    color: 'var(--cp-acc2)',   borderColor: 'var(--cp-border)'  },
  op:   { fontSize: 19, background: 'var(--cp-accdim)', color: 'var(--cp-acc)',    borderColor: 'var(--cp-border)'  },
  util: { fontSize: 17, background: 'var(--cp-bg2)',    color: 'var(--cp-muted)',  borderColor: 'var(--cp-border)'  },
  clr:  { fontSize: 14, background: 'rgba(239,68,68,0.12)',   color: 'var(--cp-red)',    borderColor: 'rgba(239,68,68,0.4)'  },
  eq:   { fontSize: 22, background: 'rgba(34,197,94,0.12)',   color: 'var(--cp-green)',  borderColor: 'rgba(34,197,94,0.4)'  },
  pi:   { fontSize: 14, background: 'rgba(167,139,250,0.12)', color: 'var(--cp-purple)', borderColor: 'rgba(167,139,250,0.4)' },
}

function Btn({ style, ...props }) {
  return <CalcButton style={{ ...BTN.base, ...style }} {...props} />
}

const fmt = v => (!isFinite(v) || isNaN(v)) ? 'Error' : parseFloat(v.toPrecision(10)).toString()

export default function ScientificCalculator() {
  const { scientific, setScientificDisplay } = useCalculatorStore()
  const d = scientific.display

  const [angle, setAngle] = useState('deg')   // 'deg' | 'rad'
  const [mem, setMem]     = useState(0)
  const [ans, setAns]     = useState(0)

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

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'clamp(5px, 0.8vh, 9px)' }}>

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

      <Btn style={{ ...BTN.eq, ...BTN.base, padding: 'clamp(12px, 1.8vh, 20px) 0' }} onClick={equals} hapticType="heavy">=</Btn>
    </div>
  )
}
