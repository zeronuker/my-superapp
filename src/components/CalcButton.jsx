import React, { useState } from 'react'
import { haptic } from '../utils/haptic'

// Shared calculator button: hover/pressed visual state + haptic feedback.
// Used by NormalCalculator, ScientificCalculator, TimeCalculator — each
// passes its own BTN style map via `style`.
export default function CalcButton({ style, children, onClick, colSpan, rowSpan, hapticType = 'light' }) {
  const [hover, setHover] = useState(false)
  const [pressed, setPressed] = useState(false)

  // Pointer events only (covers mouse + touch + pen) — mixing them with
  // separate onMouseEnter/Leave let hover and pressed desync on iPad's
  // hybrid touch/trackpad input, leaving buttons stuck in the pressed state.
  const endPress = () => setPressed(false)
  const endHover = (e) => { if (e.pointerType !== 'touch') setHover(false); endPress() }

  return (
    <button
      onClick={onClick}
      onPointerEnter={(e) => { if (e.pointerType !== 'touch') setHover(true) }}
      onPointerLeave={endHover}
      onPointerDown={(e) => { setPressed(true); if (e.pointerType !== 'touch') setHover(true); haptic(hapticType) }}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onLostPointerCapture={endPress}
      style={{
        ...style,
        opacity: pressed ? 0.65 : hover ? 0.85 : 1,
        gridColumn: colSpan ? `span ${colSpan}` : undefined,
        gridRow: rowSpan ? `span ${rowSpan}` : undefined,
      }}
    >
      {/* Scale lives on an inner wrapper, not the button itself, so the
          button's own hit-test box never resizes mid-touch — iOS Safari can
          drop the pointerup/click for a target that shrinks under the finger. */}
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: pressed ? 'scale(0.91)' : hover ? 'scale(0.97)' : 'scale(1)',
      }}>
        {children}
      </div>
    </button>
  )
}
