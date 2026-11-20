import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// eLogbook's tab highlight (.cp-bf-ind in oxygen.css): one element that glides under whichever tab has
// aria-selected="true". Put `rowRef` on the (position: relative) row that holds the tabs and render `indicator`
// as its first child. The active tab's own border must be transparent: the highlight draws it.
// First placement is instant; later moves glide. `underline`: the highlight is a 2px line along the active
// tab's bottom edge (.cp-sub-ind) instead of a box, and it also follows the tab onto a wrapped line.
export function useGlide(active, { underline = false } = {}) {
  const rowRef = useRef(null)
  const [ind, setInd] = useState(null)
  const [armed, setArmed] = useState(false)

  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return // a row that is only shown sometimes
    const measure = () => {
      const el = row.querySelector('[aria-selected="true"]')
      // Position from on-screen rects, converted back to the row's own pixels with the tab's rendered/layout width
      // ratio. offsetLeft/offsetTop are not reliable under the app's CSS `zoom` (Font size setting): iPad Safari
      // returns them already scaled, which pushed the highlight off its tab. offsetWidth is fine there.
      let next = null
      if (el) {
        const rr = row.getBoundingClientRect(), tr = el.getBoundingClientRect()
        const k = el.offsetWidth ? tr.width / el.offsetWidth : 1
        const px = n => Math.round(n * 10) / 10
        next = { left: px((tr.left - rr.left) / k), width: el.offsetWidth, bottom: px((tr.bottom - rr.top) / k) }
      }
      setInd(p => (p && next && p.left === next.left && p.width === next.width && p.bottom === next.bottom ? p : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(row)
    document.fonts?.ready.then(measure)
    return () => ro.disconnect()
  }, [active]) // tab or badge width changes are caught by the ResizeObserver

  useEffect(() => { setArmed(true) }, [])

  const cls = underline ? 'cp-sub-ind' : 'cp-bf-ind'
  const indicator = ind && (
    <i className={`${cls}${armed ? ` ${cls}-go` : ''}`} aria-hidden="true"
      style={{ width: ind.width, transform: underline ? `translate(${ind.left}px, ${ind.bottom - 2}px)` : `translateX(${ind.left}px)` }} />
  )
  return { rowRef, indicator }
}
