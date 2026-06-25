import React, { useEffect, useRef } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import CalcButton from './CalcButton'

function formatDigits(digits) {
  if (!digits) return '0:00'
  const padded = digits.padStart(8, '0')
  let h = parseInt(padded.slice(0, 6), 10)
  let m = parseInt(padded.slice(6), 10)
  if (m >= 60) { h += Math.floor(m / 60); m = m % 60 }
  if (digits.length === 1) return `0:0${digits}`
  return `${h}:${String(m).padStart(2, '0')}`
}

function minutesToDisplay(totalMinutes) {
  const negative = totalMinutes < 0
  const abs = Math.abs(totalMinutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${negative ? '-' : ''}${h}:${String(m).padStart(2, '0')}`
}

function digitsToMinutes(digits) {
  if (!digits) return 0
  const padded = digits.padStart(8, '0')
  const h = parseInt(padded.slice(0, 6), 10)
  const m = parseInt(padded.slice(6), 10)
  return h * 60 + m
}

function compute(prevMin, op, digits, multiplierStr, isMultiplierMode) {
  if (isMultiplierMode) {
    const factor = parseFloat(multiplierStr)
    if (isNaN(factor) || factor === 0) return prevMin
    if (op === '×') return Math.round(prevMin * factor)
    if (op === '÷') return Math.round(prevMin / factor)
  }
  const curMin = digitsToMinutes(digits)
  if (op === '+') return prevMin + curMin
  if (op === '-') return prevMin - curMin
  return prevMin
}

const BTN = {
  base: {
    fontFamily: "var(--cb-font-mono)",
    fontSize: 22,
    fontWeight: 700,
    border: '1px solid var(--cp-border)',
    borderRadius: 6,
    cursor: 'pointer',
    padding: 'clamp(14px, 2vh, 22px) 0',
    transition: 'all 0.1s',
    userSelect: 'none',
    letterSpacing: '0.05em',
  },
  num: { background: 'var(--cp-bg3)', color: 'var(--cp-txt)', borderColor: 'var(--cp-border2)' },
  op:  { background: 'var(--cp-accdim)', color: 'var(--cp-acc)', borderColor: 'var(--cp-border)' },
  opActive: { background: 'var(--cp-accdim)', color: 'var(--cp-acc)', borderColor: 'var(--cp-acc)', boxShadow: '0 0 8px var(--cp-accdim)' },
  util:{ background: 'var(--cp-bg2)', color: 'var(--cp-muted)', borderColor: 'var(--cp-border)' },
  clr: { background: 'rgba(239,68,68,0.12)', color: 'var(--cp-red)', borderColor: 'rgba(239,68,68,0.4)' },
  eq:  { background: 'rgba(34,197,94,0.12)', color: 'var(--cp-green)', borderColor: 'rgba(34,197,94,0.4)' },
}

function Btn({ style, ...props }) {
  return <CalcButton style={{ ...BTN.base, ...style }} {...props} />
}

export default function TimeCalculator() {
  const { time, setTime } = useCalculatorStore(s => ({ time: s.time, setTime: s.setTime }))
  const { digits, multiplier, prevMinutes, operation, isMultiplierMode, expression, result, justCalculated } = time

  const currentDisplay = justCalculated && result !== null
    ? minutesToDisplay(result)
    : isMultiplierMode ? (multiplier || '0') : formatDigits(digits)

  function handleDigit(d) {
    if (justCalculated) {
      setTime({ justCalculated: false, result: null, prevMinutes: null, operation: null, expression: '' })
    }
    if (isMultiplierMode) { if (multiplier.length < 8) setTime({ multiplier: multiplier + d }); return }
    if (digits.length >= 8) return
    setTime({ digits: digits + d })
  }

  function handleDecimal() {
    if (isMultiplierMode && !multiplier.includes('.')) setTime({ multiplier: (multiplier || '0') + '.' })
  }

  function handleBackspace() {
    if (justCalculated) return
    if (isMultiplierMode) setTime({ multiplier: multiplier.slice(0, -1) })
    else setTime({ digits: digits.slice(0, -1) })
  }

  function handleOperation(op) {
    const nextIsMultiplier = op === '×' || op === '÷'
    if (operation !== null && (digits !== '' || multiplier !== '')) {
      const intermediate = compute(prevMinutes, operation, digits, multiplier, isMultiplierMode)
      setTime({ prevMinutes: intermediate, expression: `${minutesToDisplay(intermediate)} ${op}`,
        operation: op, digits: '', multiplier: '', isMultiplierMode: nextIsMultiplier,
        justCalculated: false, result: null })
    } else if (justCalculated && result !== null) {
      setTime({ prevMinutes: result, expression: `${minutesToDisplay(result)} ${op}`,
        operation: op, digits: '', multiplier: '', isMultiplierMode: nextIsMultiplier,
        justCalculated: false, result: null })
    } else {
      const cur = isMultiplierMode ? prevMinutes : digitsToMinutes(digits)
      setTime({ prevMinutes: cur ?? 0,
        expression: `${isMultiplierMode ? minutesToDisplay(cur ?? 0) : formatDigits(digits)} ${op}`,
        operation: op, digits: '', multiplier: '', isMultiplierMode: nextIsMultiplier,
        justCalculated: false, result: null })
    }
  }

  function handleEquals() {
    if (operation === null) return
    const res = compute(prevMinutes ?? 0, operation, digits, multiplier, isMultiplierMode)
    setTime({ result: res, justCalculated: true, expression: '',
      digits: '', multiplier: '', operation: null, isMultiplierMode: false })
  }

  function handleClear() {
    setTime({ digits: '', multiplier: '', prevMinutes: null, operation: null,
      isMultiplierMode: false, expression: '', result: null, justCalculated: false })
  }

  // Keyboard support — ref pattern avoids stale closures, registers once
  const keyRef = useRef({})
  keyRef.current = { handleDigit, handleDecimal, handleOperation, handleEquals, handleBackspace, handleClear }
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const h = keyRef.current
      if (e.key >= '0' && e.key <= '9') h.handleDigit(e.key)
      else if (e.key === '.') h.handleDecimal()
      else if (e.key === '+') h.handleOperation('+')
      else if (e.key === '-') h.handleOperation('-')
      else if (e.key === '*') h.handleOperation('×')
      else if (e.key === '/') { e.preventDefault(); h.handleOperation('÷') }
      else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); h.handleEquals() }
      else if (e.key === 'Backspace') h.handleBackspace()
      else if (e.key === 'Escape') h.handleClear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const opStyle = o => operation === o && !justCalculated ? BTN.opActive : BTN.op

  return (
    <div style={{ maxWidth: 380, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Display */}
      <div style={{ background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)', borderRadius: 6, padding: '16px 24px 20px', textAlign: 'right' }}>
        <div style={{ fontSize: 13, color: 'var(--cp-dim)', fontFamily: "var(--cb-font-mono)", height: 20, marginBottom: 6 }}>{expression}</div>
        <div style={{
          color: 'var(--cp-acc)', fontWeight: 700, fontFamily: "var(--cb-font-mono)",
          fontSize: currentDisplay.length > 7 ? '2.6rem' : '3.6rem', lineHeight: 1, letterSpacing: '0.05em',
        }}>{currentDisplay}</div>
        <div style={{ fontSize: 11, color: 'var(--cp-dim)', marginTop: 8, letterSpacing: '0.1em' }}>
          {isMultiplierMode ? 'ENTER PLAIN NUMBER (e.g. 1.5)' : 'TYPE RIGHT-TO-LEFT — e.g. 6, 3, 0 → 6:30'}
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <Btn onClick={handleClear} style={BTN.clr} colSpan={2} hapticType="medium">C</Btn>
        <Btn onClick={handleBackspace} style={BTN.util}>⌫</Btn>
        <Btn onClick={() => handleOperation('÷')} style={opStyle('÷')}>÷</Btn>

        {[7,8,9].map(d => <Btn key={d} onClick={() => handleDigit(String(d))} style={BTN.num}>{d}</Btn>)}
        <Btn onClick={() => handleOperation('×')} style={opStyle('×')}>×</Btn>

        {[4,5,6].map(d => <Btn key={d} onClick={() => handleDigit(String(d))} style={BTN.num}>{d}</Btn>)}
        <Btn onClick={() => handleOperation('-')} style={opStyle('-')}>−</Btn>

        {[1,2,3].map(d => <Btn key={d} onClick={() => handleDigit(String(d))} style={BTN.num}>{d}</Btn>)}
        <Btn onClick={() => handleOperation('+')} style={opStyle('+')} rowSpan={2}>+</Btn>

        <Btn onClick={() => handleDigit('0')} style={BTN.num} colSpan={2}>0</Btn>
        <Btn onClick={handleDecimal} style={BTN.util}>.</Btn>
      </div>

      <Btn onClick={handleEquals} style={{ ...BTN.eq, ...BTN.base, fontSize: 26, padding: 'clamp(14px, 2vh, 22px) 0' }} hapticType="heavy">=</Btn>

      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.1em', lineHeight: 1.8 }}>
        + AND − ADD/SUBTRACT HH:MM TIMES<br/>× AND ÷ MULTIPLY/DIVIDE BY A PLAIN NUMBER
      </div>
    </div>
  )
}
