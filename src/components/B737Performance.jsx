import React, { useState } from 'react'
import { TabIcon } from './TabIcon'
import EDTOCalculator from './EDTOCalculator'
import GoAroundClimbGradient from './GoAroundClimbGradient'
import QuickTurnaroundLimitWeight from './QuickTurnaroundLimitWeight'

const MODES = [
  { id: 'edto',     label: 'EDTO',                   icon: '🛬' },
  { id: 'goaround', label: 'GO-AROUND (ENG INOP)',    icon: '⤴️' },
  { id: 'quickturnaround', label: 'QUICK TURNAROUND', icon: '🛞' },
]

export default function B737Performance() {
  const [mode, setMode] = useState('edto')

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'inline-flex',
        background: 'var(--cp-bg3)',
        border: '1px solid var(--cp-border)',
        borderRadius: 6,
        padding: 3,
        gap: 3,
        maxWidth: '100%',
        overflowX: 'auto',
        marginBottom: 12,
        flexShrink: 0,
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

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {mode === 'edto'     && <EDTOCalculator />}
        {mode === 'goaround' && <GoAroundClimbGradient />}
        {mode === 'quickturnaround' && <QuickTurnaroundLimitWeight />}
      </div>
    </div>
  )
}
