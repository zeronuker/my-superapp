import React, { useState, useEffect } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { haptic } from '../utils/haptic'

const BTN = {
  base: {
    fontFamily: "var(--cb-font-mono)",
    fontSize: 22, fontWeight: 700,
    border: '1px solid var(--cp-border)',
    borderRadius: 6, cursor: 'pointer',
    padding: '22px 0',
    transition: 'all 0.1s',
    userSelect: 'none',
  },
  num:      { background: 'var(--cp-bg3)',             color: 'var(--cp-txt)',    borderColor: 'var(--cp-border2)' },
  op:       { background: 'var(--cp-accdim)',           color: 'var(--cp-acc)',    borderColor: 'var(--cp-border)'  },
  opActive: { background: 'var(--cp-accdim)',           color: 'var(--cp-acc)',    borderColor: 'var(--cp-acc)', boxShadow: '0 0 8px var(--cp-accdim)' },
  util:     { background: 'var(--cp-bg2)',              color: 'var(--cp-muted)',  borderColor: 'var(--cp-border)'  },
  clr:      { background: 'rgba(239,68,68,0.12)',       color: 'var(--cp-red)',    borderColor: 'rgba(239,68,68,0.4)' },
  eq:       { background: 'rgba(34,197,94,0.12)',       color: 'var(--cp-green)',  borderColor: 'rgba(34,197,94,0.4)' },
}

function Btn({ style, children, onClick, colSpan, rowSpan, hapticType = 'light' }) {
  const [hover, setHover] = useState(false)
  const [pressed, setPressed] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false) }}
      onPointerDown={() => { setPressed(true); haptic(hapticType) }}
      onPointerUp={() => setPressed(false)}
      style={{
        ...BTN.base, ...style,
        opacity: pressed ? 0.65 : hover ? 0.85 : 1,
        transform: pressed ? 'scale(0.91)' : hover ? 'scale(0.97)' : 'scale(1)',
        gridColumn: colSpan ? `span ${colSpan}` : undefined,
        gridRow: rowSpan ? `span ${rowSpan}` : undefined,
      }}
    >{children}</button>
  )
}

export default function NormalCalculator() {
  const { normal, setNormalDisplay, setNormalOperation } = useCalculatorStore()
  const [expression, setExpression] = useState('')
  const [clearNext, setClearNext] = useState(false)

  const handleNumber = (num) => {
    if (clearNext) {
      setNormalDisplay(String(num))
      setExpression('')
      setClearNext(false)
    } else {
      const newDisplay = normal.display === '0' ? String(num) : normal.display + String(num)
      setNormalDisplay(newDisplay)
    }
  }

  const handleOperation = (op) => {
    setClearNext(false)
    if (normal.operation) {
      // chain: compute pending first, then set new op
      const current = parseFloat(normal.display)
      let result = normal.previousValue
      if (normal.operation === '+') result = normal.previousValue + current
      else if (normal.operation === '-') result = normal.previousValue - current
      else if (normal.operation === '×') result = normal.previousValue * current
      else if (normal.operation === '÷') result = normal.previousValue / current
      const r = parseFloat(result.toPrecision(12))
      setExpression(`${r} ${op}`)
      setNormalOperation(r, op)
    } else {
      setExpression(`${normal.display} ${op}`)
      setNormalOperation(parseFloat(normal.display), op)
    }
    setNormalDisplay('0')
  }

  const handleEquals = () => {
    if (!normal.operation) return
    const current = parseFloat(normal.display)
    if (normal.operation === '÷' && current === 0) {
      setExpression(`${normal.previousValue} ÷ 0 =`)
      setNormalDisplay('Error')
      setNormalOperation(0, null)
      setClearNext(true)
      return
    }
    let result = normal.previousValue
    if (normal.operation === '+') result = normal.previousValue + current
    else if (normal.operation === '-') result = normal.previousValue - current
    else if (normal.operation === '×') result = normal.previousValue * current
    else if (normal.operation === '÷') result = normal.previousValue / current
    const r = parseFloat(result.toPrecision(12))
    setExpression(`${normal.previousValue} ${normal.operation} ${current} =`)
    setNormalDisplay(String(r))
    setNormalOperation(0, null)
    setClearNext(true)
  }

  const handleClear = () => {
    setNormalDisplay('0')
    setNormalOperation(0, null)
    setExpression('')
    setClearNext(false)
  }

  const handleBackspace = () => {
    if (clearNext) { handleClear(); return }
    const next = normal.display.slice(0, -1)
    setNormalDisplay(next || '0')
  }

  const handleDecimal = () => {
    if (clearNext) { setNormalDisplay('0.'); setClearNext(false); setExpression(''); return }
    if (!normal.display.includes('.')) setNormalDisplay(normal.display + '.')
  }

  // Keyboard support
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key >= '0' && e.key <= '9') handleNumber(parseInt(e.key))
      else if (e.key === '.') handleDecimal()
      else if (e.key === '+') handleOperation('+')
      else if (e.key === '-') handleOperation('-')
      else if (e.key === '*') handleOperation('×')
      else if (e.key === '/') { e.preventDefault(); handleOperation('÷') }
      else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); handleEquals() }
      else if (e.key === 'Backspace') handleBackspace()
      else if (e.key === 'Escape') handleClear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [normal.display, normal.operation, normal.previousValue, clearNext])

  const opStyle = o => normal.operation === o ? BTN.opActive : BTN.op

  const exprLine = expression || (normal.operation ? `${normal.previousValue} ${normal.operation}` : ' ')

  return (
    <div style={{ maxWidth: 380, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Display */}
      <div style={{ background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)', borderRadius: 6, padding: '16px 24px 20px', textAlign: 'right' }}>
        <div style={{ fontSize: 13, color: 'var(--cp-dim)', fontFamily: "var(--cb-font-mono)", height: 20, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.05em' }}>
          {exprLine}
        </div>
        <div style={{
          color: 'var(--cp-acc)', fontWeight: 700, fontFamily: "var(--cb-font-mono)",
          fontSize: normal.display.length > 10 ? '2.2rem' : '3.6rem', lineHeight: 1, letterSpacing: '0.05em',
        }}>{normal.display}</div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <Btn onClick={handleClear} style={BTN.clr} colSpan={2} hapticType="medium">C</Btn>
        <Btn onClick={handleBackspace} style={BTN.util}>⌫</Btn>
        <Btn onClick={() => handleOperation('÷')} style={opStyle('÷')}>÷</Btn>

        {[7,8,9].map(d => <Btn key={d} onClick={() => handleNumber(d)} style={BTN.num}>{d}</Btn>)}
        <Btn onClick={() => handleOperation('×')} style={opStyle('×')}>×</Btn>

        {[4,5,6].map(d => <Btn key={d} onClick={() => handleNumber(d)} style={BTN.num}>{d}</Btn>)}
        <Btn onClick={() => handleOperation('-')} style={opStyle('-')}>−</Btn>

        {[1,2,3].map(d => <Btn key={d} onClick={() => handleNumber(d)} style={BTN.num}>{d}</Btn>)}
        <Btn onClick={() => handleOperation('+')} style={opStyle('+')} rowSpan={2}>+</Btn>

        <Btn onClick={() => handleNumber(0)} style={BTN.num} colSpan={2}>0</Btn>
        <Btn onClick={handleDecimal} style={BTN.util}>.</Btn>
      </div>

      <Btn onClick={handleEquals} style={{ ...BTN.eq, ...BTN.base, fontSize: 26, padding: '22px 0' }} hapticType="heavy">=</Btn>
    </div>
  )
}
