import { useState } from 'react'

const CONFIRM_MESSAGE = 'Reset this module? All entered data will be cleared.'

// Standardized reset button: visibly orange by default (no hover needed to
// read as "careful"), escalates to red on hover/press as the action is about
// to actually fire, and always confirms before clearing data.
export default function ResetButton({ onReset }) {
  const [hover, setHover] = useState(false)
  const [pressed, setPressed] = useState(false)

  const colors = pressed || hover
    ? { borderColor: 'var(--cp-red)', color: 'var(--cp-red)', background: pressed ? 'rgba(239,68,68,0.20)' : 'rgba(239,68,68,0.10)' }
    : { borderColor: 'rgba(251,146,60,0.4)', color: 'var(--cp-orange)', background: 'rgba(251,146,60,0.08)' }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <button
        onClick={() => { if (window.confirm(CONFIRM_MESSAGE)) onReset() }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); setPressed(false) }}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        style={{
          fontFamily: 'var(--cb-font-mono)', fontSize: 12, letterSpacing: '0.15em',
          textTransform: 'uppercase', padding: '7px 16px', borderRadius: 4,
          border: '1px solid', cursor: 'pointer', transition: 'all 0.12s',
          ...colors,
        }}
      >↺ RESET</button>
    </div>
  )
}
