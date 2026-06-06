import React, { useState } from 'react'
import NormalCalculator from './NormalCalculator'
import ScientificCalculator from './ScientificCalculator'
import TimeCalculator from './TimeCalculator'

const MODES = [
  { id: 'basic',      label: 'BASIC' },
  { id: 'scientific', label: 'SCIENTIFIC' },
  { id: 'time',       label: 'TIME' },
]

export default function CombinedCalculator() {
  const [mode, setMode] = useState('basic')

  return (
    <div>
      {/* ── Mode toggle ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
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
    </div>
  )
}
