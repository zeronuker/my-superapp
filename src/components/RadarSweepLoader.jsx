import React, { useEffect, useMemo, useState } from 'react'

// Per-chip pacing floor — a step never runs faster than this, so the
// "Scanning XXXX…" label stays readable no matter how many targets there are.
export const CHIP_FLOOR_MS = 500
// Baseline total for small target counts (chips compress up to the floor).
export const BASE_ANIM_MS  = 2500
// Hard ceiling on total runtime — past the point where every target could
// get its own floor-paced step, targets share a step instead of speeding up
// further (see groupTargets below).
export const MAX_ANIM_MS   = 6000

// Total time the caller must wait before revealing data, so the animation
// always finishes first regardless of how fast the real fetch resolves.
export function computeAnimDuration(targetCount) {
  if (targetCount <= 0) return 0
  return Math.min(Math.max(BASE_ANIM_MS, targetCount * CHIP_FLOOR_MS), MAX_ANIM_MS)
}

// Splits targets into steps: one target per step while that stays within
// MAX_ANIM_MS at the floor pace, otherwise batches multiple targets into the
// same step (evenly distributed, no empty steps) so each step still gets at
// least CHIP_FLOOR_MS and the total stays capped.
function planAnimation(targets) {
  const n = targets.length
  if (n === 0) return { groups: [], stepMs: 0 }
  const totalMs = computeAnimDuration(n)
  const numSteps = n * CHIP_FLOOR_MS <= MAX_ANIM_MS ? n : Math.floor(MAX_ANIM_MS / CHIP_FLOOR_MS)
  const groups = numSteps >= n
    ? targets.map(t => [t])
    : Array.from({ length: numSteps }, (_, i) => targets.slice(
        Math.floor((i * n) / numSteps),
        Math.floor(((i + 1) * n) / numSteps),
      ))
  return { groups, stepMs: totalMs / numSteps }
}

// Cosmetic per-target progress cue shown during a manual fetch. Both METAR/TAF
// and NOTAM fetch all targets in one batched request, so this stepper is a
// perceived-progress indicator only — it is not tied to real per-target
// completion.
export default function RadarSweepLoader({ targets }) {
  const { groups, stepMs } = useMemo(() => planAnimation(targets), [targets])
  const [completed, setCompleted] = useState(0)

  useEffect(() => {
    if (completed >= groups.length) return
    const t = setTimeout(() => setCompleted(c => c + 1), stepMs)
    return () => clearTimeout(t)
  }, [completed, groups.length, stepMs])

  const currentGroup = groups[completed]
  const label = currentGroup ? `Scanning ${currentGroup.join(', ')}…` : 'Compiling report…'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
      padding: '28px 0', width: '100%', maxWidth: 420, margin: '0 auto',
    }}>
      <div style={{
        position: 'relative', width: 100, height: 100, borderRadius: '50%',
        background: 'var(--cp-bg2)', border: '1px solid var(--cp-acc)', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 14, borderRadius: '50%', border: '1px solid var(--cp-acc)', opacity: 0.15 }} />
        <div style={{ position: 'absolute', inset: 34, borderRadius: '50%', border: '1px solid var(--cp-acc)', opacity: 0.15 }} />
        <div style={{ position: 'absolute', top: '50%', left: 4, right: 4, height: 1, background: 'var(--cp-acc)', opacity: 0.08 }} />
        <div style={{ position: 'absolute', left: '50%', top: 4, bottom: 4, width: 1, background: 'var(--cp-acc)', opacity: 0.08 }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'conic-gradient(from 0deg, rgba(var(--cp-acc-rgb,63,224,197),0.55) 0deg, rgba(var(--cp-acc-rgb,63,224,197),0) 50deg, rgba(var(--cp-acc-rgb,63,224,197),0) 360deg)',
          animation: 'cp-spin 1.8s linear infinite',
        }} />
      </div>

      <div className="cp-label">{label}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
        {groups.map((group, gi) => {
          const state = gi < completed ? 'done' : gi === completed ? 'scanning' : 'pending'
          return group.map((code, ci) => (
            <div key={code + gi + ci} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: 'var(--cb-font-mono)', fontSize: 10, letterSpacing: '0.1em',
              padding: '4px 10px', borderRadius: 4,
              border: `1px solid ${state === 'pending' ? 'var(--cp-border)' : 'var(--cp-acc)'}`,
              background: state === 'scanning' ? 'var(--cp-accdim)' : 'transparent',
              color: state === 'pending' ? 'var(--cp-dim)' : state === 'scanning' ? 'var(--cp-acc)' : 'var(--cp-txt)',
              animation: state === 'scanning' ? 'blink 0.9s ease-in-out infinite' : 'none',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: state === 'pending' ? 'var(--cp-border)' : 'var(--cp-acc)',
                boxShadow: state === 'scanning' ? '0 0 6px rgba(var(--cp-acc-rgb,63,224,197),0.8)' : 'none',
              }} />
              {code}
            </div>
          ))
        })}
      </div>
    </div>
  )
}
