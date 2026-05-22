import React, { useEffect } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { haptic } from '../utils/haptic'
import { MAX_CALC_VAL, formatDisplayNum } from '../utils/formatDisplay'

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
  const [hover, setHover] = React.useState(false)
  const [pressed, setPressed] = React.useState(false)
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
  // All state — including expression and clearNext — lives in Zustand so it
  // survives tab switches. setNormal is a partial updater (single store write).
  const { normal, setNormal } = useCalculatorStore(s => ({
    normal: s.normal,
    setNormal: s.setNormal,
  }))
  const { display, previousValue, operation, expression, clearNext } = normal

  const handleNumber = (num) => {
    if (clearNext) {
      setNormal({ display: String(num), expression: '', clearNext: false })
    } else {
      const newDisplay = display === '0' ? String(num) : display + String(num)
      setNormal({ display: newDisplay })
    }
  }

  const handleOperation = (op) => {
    // If display is OUT OF RANGE, start fresh from 0
    if (display === 'OUT OF RANGE') {
      setNormal({ display: '0', previousValue: 0, operation: op,
        expression: `0 ${op}`, clearNext: false })
      return
    }
    if (operation) {
      // Chain: compute pending result then set new operator
      const current = parseFloat(display)
      let result = previousValue
      if (operation === '+') result = previousValue + current
      else if (operation === '-') result = previousValue - current
      else if (operation === '×') result = previousValue * current
      else if (operation === '÷') result = previousValue / current
      const r = parseFloat(result.toPrecision(12))
      if (!isFinite(r) || isNaN(r)) {
        setNormal({ display: 'Error', previousValue: 0, operation: null, expression: '', clearNext: true })
        return
      }
      if (Math.abs(r) > MAX_CALC_VAL) {
        setNormal({ display: 'OUT OF RANGE', previousValue: 0, operation: null, expression: '', clearNext: true })
        return
      }
      setNormal({ display: '0', previousValue: r, operation: op,
        expression: `${r} ${op}`, clearNext: false })
    } else {
      const pv = parseFloat(display)
      setNormal({ display: '0', previousValue: pv, operation: op,
        expression: `${display} ${op}`, clearNext: false })
    }
  }

  const handleEquals = () => {
    if (!operation || display === 'OUT OF RANGE') return
    const current = parseFloat(display)
    if (operation === '÷' && current === 0) {
      setNormal({ expression: `${previousValue} ÷ 0 =`, display: 'Error',
        previousValue: 0, operation: null, clearNext: true })
      return
    }
    let result = previousValue
    if (operation === '+') result = previousValue + current
    else if (operation === '-') result = previousValue - current
    else if (operation === '×') result = previousValue * current
    else if (operation === '÷') result = previousValue / current
    const r = parseFloat(result.toPrecision(12))
    if (!isFinite(r) || isNaN(r)) {
      setNormal({ expression: `${previousValue} ${operation} ${current} =`, display: 'Error',
        previousValue: 0, operation: null, clearNext: true })
      return
    }
    if (Math.abs(r) > MAX_CALC_VAL) {
      setNormal({ expression: `${previousValue} ${operation} ${current} =`, display: 'OUT OF RANGE',
        previousValue: 0, operation: null, clearNext: true })
      return
    }
    setNormal({
      expression: `${previousValue} ${operation} ${current} =`,
      display: String(r),
      previousValue: 0, operation: null, clearNext: true,
    })
  }

  const handleClear = () => {
    setNormal({ display: '0', previousValue: 0, operation: null,
      expression: '', clearNext: false })
  }

  const handleBackspace = () => {
    if (clearNext) { handleClear(); return }
    const next = display.slice(0, -1)
    setNormal({ display: next || '0' })
  }

  const handleDecimal = () => {
    if (clearNext) {
      setNormal({ display: '0.', clearNext: false, expression: '' })
      return
    }
    if (!display.includes('.')) setNormal({ display: display + '.' })
  }

  // Keyboard support — re-registers whenever Zustand state changes
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
  }, [display, operation, previousValue, clearNext])

  const opStyle = o => operation === o && !clearNext ? BTN.opActive : BTN.op

  const exprLine       = expression || (operation ? `${previousValue} ${operation}` : ' ')
  const formattedDisplay = formatDisplayNum(display)

  return (
    <div style={{ maxWidth: 380, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Display */}
      <div style={{ background: 'var(--cp-bg3)', border: '1px solid var(--cp-border)', borderRadius: 6, padding: '16px 24px 20px', textAlign: 'right' }}>
        <div style={{ fontSize: 13, color: 'var(--cp-dim)', fontFamily: "var(--cb-font-mono)", height: 20, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.05em' }}>
          {exprLine}
        </div>
        <div style={{
          color: 'var(--cp-acc)', fontWeight: 700, fontFamily: "var(--cb-font-mono)",
          fontSize: formattedDisplay.length > 16 ? '1.6rem'
                  : formattedDisplay.length > 12 ? '2.2rem'
                  : formattedDisplay.length > 9  ? '2.8rem'
                  : '3.6rem',
          lineHeight: 1, letterSpacing: '0.05em',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>{formattedDisplay}</div>
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
