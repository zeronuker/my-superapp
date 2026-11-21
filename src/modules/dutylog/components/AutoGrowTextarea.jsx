import { forwardRef, useCallback, useLayoutEffect, useRef } from 'react'

// A textarea that keeps its starting height, grows as the user types up to 1.5x that height, then scrolls.
// The height change eases (.oxy-grow in oxygen.css), so the target is measured with the transition switched off.
const AutoGrowTextarea = forwardRef(function AutoGrowTextarea({ value, style, className = '', ...rest }, outerRef) {
  const innerRef = useRef(null)
  const base = useRef(0)   // starting height (px), measured once

  const setRefs = useCallback((el) => {
    innerRef.current = el
    if (typeof outerRef === 'function') outerRef(el)
    else if (outerRef) outerRef.current = el
  }, [outerRef])

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    if (!base.current) {
      el.style.height = ''   // the CSS / rows height is the starting height
      base.current = el.offsetHeight
    }
    if (!base.current) return   // not laid out (hidden): leave it to CSS
    const prev = el.style.height
    el.style.transition = 'none'
    el.style.height = '0px'   // content height is only readable when the box is not already taller
    const edge = el.offsetHeight - el.clientHeight   // borders (border-box sizing)
    const want = el.scrollHeight + edge
    el.style.height = prev
    void el.offsetHeight      // commit the old height, so the next change animates from it
    el.style.transition = ''
    const max = base.current * 1.5
    el.style.height = `${Math.min(Math.max(want, base.current), max)}px`
    el.style.overflowY = want > max ? 'auto' : 'hidden'
  }, [value])

  return <textarea ref={setRefs} value={value} className={`${className} oxy-grow`} style={{ ...style, resize: 'none' }} {...rest} />
})

export default AutoGrowTextarea
