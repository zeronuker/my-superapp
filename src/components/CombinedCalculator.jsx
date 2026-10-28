import React, { useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'
import { TabIcon } from './TabIcon'
import NormalCalculator from './NormalCalculator'
import ScientificCalculator from './ScientificCalculator'
import TimeCalculator from './TimeCalculator'
import Converter from './Converter'
import ResetButton from './ResetButton'
import { useTransitionAnim } from '../useTransitionAnim'

const MODES = [
  { id: 'basic',      label: 'BASIC',      icon: '🔢' },
  { id: 'scientific', label: 'SCIENTIFIC', icon: '🔬' },
  { id: 'time',       label: 'TIME',       icon: '⏱️' },
  { id: 'convert',    label: 'CONVERT',    icon: '🔄' },
]

// `modes` picks which of the four this tab shows: with more than one it gets the switch, with one
// it is that calculator alone.
export default function CombinedCalculator({ animStyle, modes = MODES.map(m => m.id) }) {
  const shown = MODES.filter(m => modes.includes(m.id))
  const [mode, setMode] = useState(shown[0].id)
  const modeAnim = useTransitionAnim(mode, shown.map(m => m.id), animStyle)
  const setNormal = useCalculatorStore(s => s.setNormal)
  const setScientificDisplay = useCalculatorStore(s => s.setScientificDisplay)
  const setTime = useCalculatorStore(s => s.setTime)

  const resettable = modes.some(m => m !== 'convert')   // the converter keeps nothing to clear
  const handleReset = () => {
    if (modes.includes('basic')) setNormal({ display: '0', previousValue: 0, operation: null, expression: '', clearNext: false })
    if (modes.includes('scientific')) setScientificDisplay('0')
    if (modes.includes('time')) setTime({
      digits: '', multiplier: '', prevMinutes: null, operation: null,
      isMultiplierMode: false, expression: '', result: null, justCalculated: false,
    })
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {(shown.length > 1 || resettable) && (
      <div className="cp-mode-head" style={{ display: 'flex', alignItems: 'center', justifyContent: shown.length > 1 ? 'space-between' : 'flex-end', gap: 10, marginBottom: 8, flexShrink: 0 }}>
        {/* ── Mode toggle ───────────────────────────────────────────────── */}
        {shown.length > 1 && <div className="cp-mode-strip" style={{
          display: 'inline-flex',
          background: 'var(--cp-bg3)',
          border: '1px solid var(--cp-border)',
          borderRadius: 6,
          padding: 3,
          gap: 3,
          maxWidth: '100%',
          overflowX: 'auto',
        }}>
          {shown.map(({ id, label, icon }) => (
            <button
              key={id}
              className="cp-mode-btn"
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
        </div>}

        {resettable && <ResetButton onReset={handleReset} />}
      </div>
      )}

      {/* ── Active calculator — fills all remaining space ────────────────── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div key={mode} className={modeAnim.className}
          style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', ...modeAnim.style }}>
          {mode === 'basic'      && <NormalCalculator />}
          {mode === 'scientific' && <ScientificCalculator />}
          {mode === 'time'       && <TimeCalculator />}
          {mode === 'convert'    && <Converter />}
        </div>
      </div>
    </div>
  )
}
