import React, { useState, useEffect } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { haptic } from '../utils/haptic'

const BTN = {
  base: {
    fontFamily: "var(--cb-font-mono)",
    fontWeight: 700,
    border: '1px solid var(--cp-border)',
    borderRadius: 6, cursor: 'pointer',
    padding: '16px 0',
    transition: 'all 0.1s',
    userSelect: 'none',
  },
  num:  { fontSize: 20, background: 'var(--cp-bg3)',    color: 'var(--cp-txt)',    borderColor: 'var(--cp-border2)' },
  sci:  { fontSize: 14, background: 'var(--cp-bg2)',    color: 'var(--cp-acc2)',   borderColor: 'var(--cp-border)'  },
  op:   { fontSize: 20, background: 'var(--cp-accdim)', color: 'var(--cp-acc)',    borderColor: 'var(--cp-border)'  },
  util: { fontSize: 20, background: 'var(--cp-bg2)',    color: 'var(--cp-muted)',  borderColor: 'var(--cp-border)'  },
  clr:  { fontSize: 15, background: 'rgba(239,68,68,0.12)',  color: 'var(--cp-red)',   borderColor: 'rgba(239,68,68,0.4)'  },
  eq:   { fontSize: 24, background: 'rgba(34,197,94,0.12)',  color: 'var(--cp-green)', borderColor: 'rgba(34,197,94,0.4)'  },
  pi:   { fontSize: 15, background: 'rgba(167,139,250,0.12)', color: 'var(--cp-purple)', borderColor: 'rgba(167,139,250,0.4)' },
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
      style={{ ...BTN.base, ...style, opacity: pressed ? 0.65 : hover ? 0.85 : 1, transform: pressed ? 'scale(0.91)' : hover ? 'scale(0.97)' : 'scale(1)', gridColumn: colSpan ? `span ${colSpan}` : undefined }}
    >{children}</button>
  )
}

export default function ScientificCalculator() {
  const { scientific, setScientificDisplay } = useCalculatorStore()

  const fmt = v => (!isFinite(v) || isNaN(v)) ? 'Error' : parseFloat(v.toPrecision(10)).toString()

  const handleNumber = num => {
    setScientificDisplay(scientific.display === '0' ? String(num) : scientific.display + String(num))
  }

  const handleUnary = op => {
    const v = parseFloat(scientific.display)
    const deg = (v * Math.PI) / 180
    const ops = {
      sin:  () => Math.sin(deg),
      cos:  () => Math.cos(deg),
      tan:  () => { const r = Math.tan(deg); return Math.abs(r) > 1e10 ? Infinity : r },
      log:  () => v <= 0 ? -Infinity : Math.log10(v),
      ln:   () => v <= 0 ? -Infinity : Math.log(v),
      sqrt: () => Math.sqrt(v),
      sq:   () => v * v,
      inv:  () => v === 0 ? Infinity : 1 / v,
      pi:   () => { setScientificDisplay(String(Math.PI)); return null },
      e:    () => { setScientificDisplay(String(Math.E)); return null },
    }
    const result = ops[op]?.()
    if (result !== null && result !== undefined) setScientificDisplay(fmt(result))
  }

  const handleBinary = op => {
    const trimmed = scientific.display.trimEnd()
    if (['+', '-', '×', '÷'].some(o => trimmed.endsWith(o))) {
      setScientificDisplay(trimmed.slice(0, -1).trimEnd() + ` ${op} `)
    } else {
      setScientificDisplay(scientific.display + ` ${op} `)
    }
  }

  const handleEquals = () => {
    try {
      const expr = scientific.display.replace(/×/g, '*').replace(/÷/g, '/')
      // eslint-disable-next-line no-new-func
      const result = Function('"use strict"; return (' + expr + ')')()
      setScientificDisplay(fmt(result))
    } catch { setScientificDisplay('Error') }
  }

  const handleClear = () => setScientificDisplay('0')
  const handleBackspace = () => {
    const trimmed = scientific.display.trimEnd()
    // Operators are stored as " op " — after trimEnd(), the string ends with the
    // operator char (e.g. "5 ×"). Find the last space to remove " op" in one press.
    const ops = ['+', '-', '×', '÷']
    if (ops.some(o => trimmed.endsWith(o))) {
      const lastSpace = trimmed.lastIndexOf(' ')
      const stripped = lastSpace >= 0 ? trimmed.slice(0, lastSpace).trimEnd() : ''
      setScientificDisplay(stripped || '0')
    } else {
      setScientificDisplay(trimmed.slice(0, -1) || '0')
    }
  }
  const handleDecimal = () => {
    const parts = scientific.display.split(' ')
    if (!parts[parts.length - 1].includes('.')) setScientificDisplay(scientific.display + '.')
  }

  // Keyboard support
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key >= '0' && e.key <= '9') handleNumber(parseInt(e.key))
      else if (e.key === '.') handleDecimal()
      else if (e.key === '+') handleBinary('+')
      else if (e.key === '-') handleBinary('-')
      else if (e.key === '*') handleBinary('×')
      else if (e.key === '/') { e.preventDefault(); handleBinary('÷') }
      else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); handleEquals() }
      else if (e.key === 'Backspace') handleBackspace()
      else if (e.key === 'Escape') handleClear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scientific.display])

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)', borderRadius: 6, padding: '18px 24px 22px', textAlign: 'right' }}>
        <div style={{ fontSize: 12, color: 'var(--cp-dim)', fontFamily: "var(--cb-font-mono)", height: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {scientific.display}
        </div>
        <div style={{
          color: 'var(--cp-acc)', fontWeight: 700, fontFamily: "var(--cb-font-mono)",
          fontSize: scientific.display.length > 14 ? '1.7rem' : '3rem', lineHeight: 1, letterSpacing: '0.05em', marginTop: 6,
        }}>
          {scientific.display.split(' ').pop() || '0'}
        </div>
      </div>

      {/* Scientific functions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 7 }}>
        <Btn style={BTN.clr} onClick={handleClear} colSpan={2} hapticType="medium">C</Btn>
        <Btn style={BTN.util} onClick={handleBackspace}>⌫</Btn>
        <Btn style={BTN.sci} onClick={() => handleUnary('sin')}>sin</Btn>
        <Btn style={BTN.sci} onClick={() => handleUnary('cos')}>cos</Btn>
        <Btn style={BTN.sci} onClick={() => handleUnary('tan')}>tan</Btn>

        <Btn style={BTN.sci} onClick={() => handleUnary('log')}>log</Btn>
        <Btn style={BTN.sci} onClick={() => handleUnary('ln')}>ln</Btn>
        <Btn style={BTN.sci} onClick={() => handleUnary('sqrt')}>√</Btn>
        <Btn style={BTN.sci} onClick={() => handleUnary('sq')}>x²</Btn>
        <Btn style={BTN.sci} onClick={() => handleUnary('inv')}>1/x</Btn>
        <Btn style={BTN.pi}  onClick={() => handleUnary('pi')}>π</Btn>
      </div>

      {/* Numpad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
        {[7,8,9].map(d => <Btn key={d} style={BTN.num} onClick={() => handleNumber(d)}>{d}</Btn>)}
        <Btn style={BTN.op} onClick={() => handleBinary('÷')}>÷</Btn>

        {[4,5,6].map(d => <Btn key={d} style={BTN.num} onClick={() => handleNumber(d)}>{d}</Btn>)}
        <Btn style={BTN.op} onClick={() => handleBinary('×')}>×</Btn>

        {[1,2,3].map(d => <Btn key={d} style={BTN.num} onClick={() => handleNumber(d)}>{d}</Btn>)}
        <Btn style={BTN.op} onClick={() => handleBinary('-')}>−</Btn>

        <Btn style={BTN.num} onClick={() => handleNumber(0)} colSpan={2}>0</Btn>
        <Btn style={BTN.util} onClick={handleDecimal}>.</Btn>
        <Btn style={BTN.op} onClick={() => handleBinary('+')}>+</Btn>
      </div>

      <Btn style={{ ...BTN.eq, ...BTN.base, padding: '22px 0' }} onClick={handleEquals} hapticType="heavy">=</Btn>
    </div>
  )
}
