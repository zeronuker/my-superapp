import { useEffect, useState } from 'react'
import { STEP_MS } from '../utils/loaderSteps'

const mono = 'var(--cb-font-mono)'

// Shown in the picture area while a satellite or winds picture is built from nothing: a satellite circling a globe,
// a line of text, and one chip per step lighting up in turn. For show only, like the METAR/TAF loader: the steps run
// on a timer, and the last one keeps blinking if the picture is slow.
export default function SatLoader({ steps }) {
  const [done, setDone] = useState(0)

  useEffect(() => {
    if (done >= steps.length) return
    const t = setTimeout(() => setDone(d => d + 1), STEP_MS)
    return () => clearTimeout(t)
  }, [done, steps.length])

  const label = done < steps.length ? steps[done].text : 'Finishing picture'

  return (
    <div role="status" aria-live="polite" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      padding: '32px 10px 28px', border: '1px solid var(--cp-border)', borderRadius: 6, background: 'var(--cp-bg2)',
    }}>
      <div className="cp-orbit-art" aria-hidden="true">
        <svg viewBox="0 0 160 110" width="160" height="110" fill="none" stroke="var(--cp-acc)">
          <ellipse cx="80" cy="55" rx="68" ry="24" strokeWidth="1" strokeDasharray="3 5" opacity="0.35" />
          <circle cx="80" cy="55" r="26" strokeWidth="1.6" />
          <ellipse cx="80" cy="55" rx="11" ry="26" strokeWidth="1" opacity="0.45" />
          <line x1="54" y1="55" x2="106" y2="55" strokeWidth="1" opacity="0.45" />
          <path d="M58 41 Q80 46 102 41M58 69 Q80 64 102 69" strokeWidth="1" opacity="0.45" />
        </svg>
        <div className="cp-orbiter">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="8" y="8" width="8" height="8" rx="1.5" fill="var(--cp-bg2)" />
            <rect x="1" y="9" width="6" height="6" />
            <rect x="17" y="9" width="6" height="6" />
          </svg>
        </div>
      </div>

      <div className="cp-label">{label}…</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
        {steps.map((s, i) => {
          // every chip done and the picture still not ready: the last one keeps blinking
          const state = done >= steps.length ? (i === steps.length - 1 ? 'scanning' : 'done')
            : i < done ? 'done' : i === done ? 'scanning' : 'pending'
          return (
            <div key={s.chip} className={state === 'scanning' ? 'cp-chip-scan' : undefined} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: mono, fontSize: 10, letterSpacing: '0.1em',
              padding: '4px 10px', borderRadius: 4,
              border: `1px solid ${state === 'pending' ? 'var(--cp-border)' : 'var(--cp-acc)'}`,
              background: state === 'scanning' ? 'var(--cp-accdim)' : 'transparent',
              color: state === 'pending' ? 'var(--cp-dim)' : state === 'scanning' ? 'var(--cp-acc)' : 'var(--cp-txt)',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: state === 'pending' ? 'var(--cp-border)' : 'var(--cp-acc)',
                boxShadow: state === 'scanning' ? '0 0 6px rgba(var(--cp-acc-rgb,63,224,197),0.8)' : 'none',
              }} />
              {s.chip}
            </div>
          )
        })}
      </div>
    </div>
  )
}
