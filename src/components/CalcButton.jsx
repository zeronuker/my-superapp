import React, { useState } from 'react'
import { haptic } from '../utils/haptic'

// Shared calculator button: hover/pressed visual state + haptic feedback.
// Used by NormalCalculator, ScientificCalculator, TimeCalculator — each
// passes its own BTN style map via `style`.
export default function CalcButton({ style, children, onClick, colSpan, rowSpan, hapticType = 'light' }) {
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
        ...style,
        opacity: pressed ? 0.65 : hover ? 0.85 : 1,
        transform: pressed ? 'scale(0.91)' : hover ? 'scale(0.97)' : 'scale(1)',
        gridColumn: colSpan ? `span ${colSpan}` : undefined,
        gridRow: rowSpan ? `span ${rowSpan}` : undefined,
      }}
    >
      {children}
    </button>
  )
}
