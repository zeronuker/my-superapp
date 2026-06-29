import { useState, useRef, useEffect } from 'react'

const CACHE_KEYS = { metar: 'cb-metar-cache', notam: 'cb-notam-cache' }
const ARM_TIMEOUT = 4000

function readOtherAirports(sourceModule) {
  try {
    const raw = localStorage.getItem(CACHE_KEYS[sourceModule])
    if (!raw) return null
    const c = JSON.parse(raw)
    const data = {
      dep: c.dep || '',
      arr: c.arr || '',
      destAlts: c.destAlts || { alt1: '', alt2: '' },
      enrouteCount: c.enrouteCount || 0,
      enrouteAlts: c.enrouteAlts || [],
    }
    const hasAny = data.dep || data.arr || data.destAlts.alt1 || data.destAlts.alt2 || data.enrouteCount > 0
    return hasAny ? data : null
  } catch (_) { return null }
}

// Copies dep/arr/destAlts/enroute from the sibling module's cache, overwriting
// this module's current airports. Requires a second click within ARM_TIMEOUT
// to confirm (inline, no window.confirm).
export default function CopyAirportsButton({ sourceModule, sourceLabel, onApply }) {
  const [armed, setArmed] = useState(false)
  const timerRef = useRef(null)
  const available = !!readOtherAirports(sourceModule)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const handleClick = () => {
    if (!armed) {
      setArmed(true)
      timerRef.current = setTimeout(() => setArmed(false), ARM_TIMEOUT)
      return
    }
    clearTimeout(timerRef.current)
    setArmed(false)
    const data = readOtherAirports(sourceModule)
    if (data) onApply(data)
  }

  const colors = armed
    ? { borderColor: 'var(--cp-red)', color: 'var(--cp-red)', background: 'rgba(239,68,68,0.10)' }
    : { borderColor: 'rgba(6,182,212,0.4)', color: '#06b6d4', background: 'rgba(6,182,212,0.08)' }

  return (
    <button
      onClick={handleClick}
      disabled={!available}
      style={{
        fontFamily: 'var(--cb-font-mono)', fontSize: 12, letterSpacing: '0.15em',
        textTransform: 'uppercase', padding: '7px 16px', borderRadius: 4,
        border: '1px solid', cursor: available ? 'pointer' : 'not-allowed',
        opacity: available ? 1 : 0.4, transition: 'all 0.12s',
        ...colors,
      }}
    >{armed ? '⚠ CONFIRM COPY?' : `⎘ COPY FROM ${sourceLabel}`}</button>
  )
}
