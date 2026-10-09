import { useLayoutEffect, useState } from 'react'
import { animDurationMs } from '../useTransitionAnim'

// Animated expand / collapse for inline panels (accordions, dropdown lists).
// Slides the height open and closed with a fade — via a grid row going between
// 0fr and 1fr, which works for content of any (auto) height — and keeps the
// content mounted for the length of the exit. With no animation (duration 0)
// it mounts and unmounts instantly.
export default function Collapse({ open, children, style }) {
  const [mounted, setMounted] = useState(open)
  const [expanded, setExpanded] = useState(open)

  useLayoutEffect(() => {
    if (open) {
      setMounted(true)
      if (!animDurationMs()) { setExpanded(true); return undefined }
      let r2
      // Two frames so the collapsed state paints first and the open transitions.
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setExpanded(true)) })
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2) }
    }
    setExpanded(false)
    if (!animDurationMs()) { setMounted(false); return undefined }
    const t = setTimeout(() => setMounted(false), animDurationMs())
    return () => clearTimeout(t)
  }, [open])

  if (!mounted && !open) return null
  return (
    <div className="cp-collapse" data-open={expanded} style={style}>
      <div className="cp-collapse-inner">{children}</div>
    </div>
  )
}
