import React, { useState, useRef, useLayoutEffect } from 'react'
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

// The CSS clamp()-based sizing inside each calculator already shrinks with
// viewport height, but it's tuned to fit exactly around ~844px tall screens —
// on shorter real screens it can still fall short of a perfect fit (and vh
// units on mobile browsers don't always match what's actually visible, e.g.
// iOS Safari's address bar). This measures the actual rendered height against
// the actual visible viewport and applies a small corrective scale on top, so
// it always closes the gap exactly rather than relying on hand-tuned
// coefficients — floored so buttons never shrink past a usable minimum.
const MIN_FIT_SCALE = 0.7

function useFitToViewport(active) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const recompute = () => {
      // Reset to natural size first so this measurement isn't skewed by a
      // scale applied on a previous pass (or the previous active mode).
      el.style.transform = ''
      el.style.width = ''
      el.style.marginLeft = ''
      el.style.marginBottom = ''

      const naturalHeight = el.scrollHeight
      if (!naturalHeight) return

      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const pageHeight = document.documentElement.scrollHeight
      const overflow = pageHeight - viewportHeight
      const neededScale = overflow > 0 ? (naturalHeight - overflow) / naturalHeight : 1
      const scale = Math.max(MIN_FIT_SCALE, Math.min(1, neededScale))

      if (scale < 1) {
        el.style.transform = `scale(${scale})`
        el.style.transformOrigin = 'top center'
        el.style.width = `${(1 / scale) * 100}%`
        el.style.marginLeft = `${-(((1 / scale) * 100) - 100) / 2}%`
        el.style.marginBottom = `${-(naturalHeight * (1 - scale))}px`
      }
    }

    recompute()
    window.addEventListener('resize', recompute)
    window.addEventListener('orientationchange', recompute)
    window.visualViewport?.addEventListener('resize', recompute)
    return () => {
      window.removeEventListener('resize', recompute)
      window.removeEventListener('orientationchange', recompute)
      window.visualViewport?.removeEventListener('resize', recompute)
    }
  }, [active])

  return ref
}

export default function CombinedCalculator() {
  const [mode, setMode] = useState('basic')
  const { setNormal, setScientificDisplay, setTime } = useCalculatorStore()
  const fitRef = useFitToViewport(mode)

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
      <div style={{ marginBottom: 'clamp(6px, 1.2vh, 14px)' }}>
        <ResetButton onReset={handleReset} />
      </div>

      {/* ── Mode toggle ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 'clamp(6px, 1vh, 14px)' }}>
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
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.04em',
                padding: 'clamp(5px, 1vh, 7px) clamp(4px, 1.3vw, 10px)',
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
      </div>

      {/* ── Active calculator ───────────────────────────────────────────── */}
      <div ref={fitRef}>
        {mode === 'basic'      && <NormalCalculator />}
        {mode === 'scientific' && <ScientificCalculator />}
        {mode === 'time'       && <TimeCalculator />}
        {mode === 'convert'    && <Converter />}
      </div>
    </div>
  )
}
