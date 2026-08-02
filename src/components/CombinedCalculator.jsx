import React, { useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { TabIcon } from './TabIcon'
import NormalCalculator from './NormalCalculator'
import ScientificCalculator from './ScientificCalculator'
import TimeCalculator from './TimeCalculator'
import Converter from './Converter'
import ResetButton from './ResetButton'

const MODES = [
  { id: 'basic',      label: 'BASIC',      icon: '🔢' },
  { id: 'scientific', label: 'SCIENTIFIC', icon: '🔬' },
  { id: 'time',       label: 'TIME',       icon: '⏱️' },
  { id: 'convert',    label: 'CONVERT',    icon: '🔄' },
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
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, flexShrink: 0 }}>
        {/* ── Mode toggle ───────────────────────────────────────────────── */}
        <div style={{
          display: 'inline-flex',
          background: 'var(--cp-bg3)',
          border: '1px solid var(--cp-border)',
          borderRadius: 6,
          padding: 3,
          gap: 3,
          maxWidth: '100%',
          overflowX: 'auto',
        }}>
          {MODES.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              style={{
                fontFamily: 'var(--cb-font-mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                padding: '7px 10px',
                borderRadius: 4,
                border: `1px solid ${mode === id ? 'var(--cp-acc)' : 'transparent'}`,
                cursor: 'pointer',
                background: mode === id ? 'var(--cp-accdim)' : 'transparent',
                color: mode === id ? 'var(--cp-acc)' : 'var(--cp-dim)',
                transition: 'all 0.12s',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <TabIcon id={id} emoji={icon} size={12} />
              {label}
            </button>
          ))}
        </div>

        <ResetButton onReset={handleReset} />
      </div>

      {/* ── Active calculator — fills all remaining space ────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {mode === 'basic'      && <NormalCalculator />}
        {mode === 'scientific' && <ScientificCalculator />}
        {mode === 'time'       && <TimeCalculator />}
        {mode === 'convert'    && <Converter />}
      </div>
    </div>
  )
}
