import { forwardRef, useCallback, useLayoutEffect, useRef } from 'react'

// A textarea that keeps its starting height, grows as the user types up to 1.5x that height, then scrolls.
const AutoGrowTextarea = forwardRef(function AutoGrowTextarea({ value, style, ...rest }, outerRef) {
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
    el.style.height = ''   // back to the CSS / rows height, so shrinking works and the start height can be read
    if (!base.current) base.current = el.offsetHeight
    if (!base.current) return   // not laid out (hidden): leave it to CSS
    const edge = el.offsetHeight - el.clientHeight   // borders (border-box sizing)
    const max = base.current * 1.5
    const want = el.scrollHeight + edge
    el.style.height = `${Math.min(Math.max(want, base.current), max)}px`
    el.style.overflowY = want > max ? 'auto' : 'hidden'
  }, [value])

  return <textarea ref={setRefs} value={value} style={{ ...style, resize: 'none' }} {...rest} />
})

export default AutoGrowTextarea
