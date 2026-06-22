import React, { useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import NormalCalculator from './NormalCalculator'
import ScientificCalculator from './ScientificCalculator'
import TimeCalculator from './TimeCalculator'
import Converter from './Converter'
import ResetButton from './ResetButton'

const MODES = [
  { id: 'basic',      label: 'BASIC' },
  { id: 'scientific', label: 'SCIENTIFIC' },
  { id: 'time',       label: 'TIME' },
  { id: 'convert',    label: 'CONVERT' },
]

export default function CombinedCalculator() {
  const [mode, setMode] = useState('basic')
  const { setNormal, setScientificDisplay, setTime } = useCalculatorStore()

  const handleReset = () => {
    setNormal({ display: '0', previousValue: 0, operation: null, expression: '', clearNext: false })
    setScientificDisplay('0')
    setTime({
      digits: '', multiplier: '', prevMinutes: null, operation: null,
      isMultiplierMode: false, expression: '', result: null, justCalculated: false,
    })
  }

  return (
    <div>
      <ResetButton onReset={handleReset} />

      {/* ── Mode toggle ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 'clamp(10px, 1.5vh, 20px)' }}>
        <div style={{
          display: 'inline-flex',
          background: 'var(--cp-bg3)',
          border: '1px solid var(--cp-border)',
          borderRadius: 6,
          padding: 3,
          gap: 3,
        }}>
          {MODES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              style={{
                fontFamily: 'var(--cb-font-mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.15em',
                padding: '7px 18px',
                borderRadius: 4,
                border: `1px solid ${mode === id ? 'var(--cp-acc)' : 'transparent'}`,
                cursor: 'pointer',
                background: mode === id ? 'var(--cp-accdim)' : 'transparent',
                color: mode === id ? 'var(--cp-acc)' : 'var(--cp-dim)',
                transition: 'all 0.12s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Active calculator ───────────────────────────────────────────── */}
      {mode === 'basic'      && <NormalCalculator />}
      {mode === 'scientific' && <ScientificCalculator />}
      {mode === 'time'       && <TimeCalculator />}
      {mode === 'convert'    && <Converter />}
    </div>
  )
}
