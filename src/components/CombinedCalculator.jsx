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

// The CSS clamp()-based sizing inside each calculator already responds to
// viewport height, but its min/max bounds mean it can still fall short of a
// perfect fit on short screens, or leave unused space on tall ones (tablets)
// — and vh units on mobile browsers don't always match what's actually
// visible (e.g. iOS Safari's address bar). This measures the actual rendered
// size against the actual visible viewport and applies the exact corrective
// scale needed to fill it — up or down — so it always uses the full height
// rather than relying on hand-tuned coefficients. Growth is limited by
// whichever of height or width is tighter, so on a tablet it never grows
// wide enough to overflow the screen just to fill height. Floored/ceilinged
// so buttons never shrink or grow past a usable/sensible size.
const MIN_FIT_SCALE = 0.7
const MAX_FIT_SCALE = 1.4

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
      // The calculator's own root has a max-width and is centered, so measure
      // it directly rather than this wrapper (which stretches full-width).
      const naturalWidth = (el.firstElementChild ?? el).getBoundingClientRect().width
      if (!naturalHeight || !naturalWidth) return

      // Use the element's own position rather than document.scrollHeight —
      // the app shell has min-height:100vh, so the whole page always measures
      // as at least one viewport tall even when actual content is shorter,
      // which would hide the slack we need to detect growth on tall screens.
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const elTop = el.getBoundingClientRect().top
      const availableHeight = viewportHeight - elTop
      const heightScaleLimit = availableHeight / naturalHeight

      const availableWidth = el.parentElement?.clientWidth ?? naturalWidth
      const widthScaleLimit = availableWidth / naturalWidth

      const neededScale = Math.min(heightScaleLimit, widthScaleLimit)
      const scale = Math.max(MIN_FIT_SCALE, Math.min(MAX_FIT_SCALE, neededScale))

      if (Math.abs(scale - 1) > 0.005) {
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
