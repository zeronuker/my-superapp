import { useState, useEffect, useCallback } from 'react'
import usePrayerStore           from '../store/prayerStore'
import { lookupAirport }        from '../../../data/airports'
import { calculateFlight }      from '../services/flightCalc'

// Parse "HHMM" / "H:MM" / "HH:MM" → minutes since midnight, or null
function hmToMin(s) {
  const d = String(s ?? '').replace(/[^0-9]/g, '')
  if (d.length < 3 || d.length > 4) return null
  const h = +d.slice(0, d.length - 2), mi = +d.slice(-2)
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

// From dep/arr clock times → elapsed + total hours. tz: 'utc' | 'local'.
// dep assumed most-recent occurrence; arr ≤ dep wraps to next day (overnight).
export function clockToElapsedTotal(depTime, arrTime, tz, now = new Date()) {
  const dM = hmToMin(depTime), aM = hmToMin(arrTime)
  if (dM == null || aM == null) return null

  const nowMs = now.getTime()
  let depMs
  if (tz === 'utc') {
    depMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Math.floor(dM / 60), dM % 60)
  } else {
    const d = new Date(now); d.setHours(Math.floor(dM / 60), dM % 60, 0, 0); depMs = d.getTime()
  }
  if (depMs > nowMs) depMs -= 86_400_000           // dep was yesterday

  let durMin = ((aM - dM) % 1440 + 1440) % 1440
  if (durMin === 0) durMin = 1440                   // arr == dep → 24 h
  const totalMs = durMin * 60_000
  const elapsedMs = Math.max(0, Math.min(totalMs, nowMs - depMs))
  return { elapsedHours: elapsedMs / 3.6e6, totalHours: totalMs / 3.6e6 }
}

/**
 * Manages flight mode state, offline detection, and calculation.
 */
export function useFlight() {
  const { flightInputs, setFlightInputs, settings } = usePrayerStore()
  const { dep, dest, mode = 'duration', elapsedHours, totalHours,
          depTime, arrTime, timeZone = 'utc', altitudeFt, headingDeg } = flightInputs

  // ── Offline detection ────────────────────────────────────────────────────────
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const goOnline  = () => setIsOffline(false)
    const goOffline = () => setIsOffline(true)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // ── Airport lookup ───────────────────────────────────────────────────────────
  const depAirport  = lookupAirport(dep)
  const destAirport = lookupAirport(dest)

  // ── Calculation result ────────────────────────────────────────────────────────
  const [result, setResult] = useState(null)
  const [error,  setError]  = useState(null)

  const calculate = useCallback(() => {
    setError(null)
    setResult(null)

    if (!depAirport)  return setError('Departure airport not found. Check the ICAO code.')
    if (!destAirport) return setError('Destination airport not found. Check the ICAO code.')

    const alt     = parseFloat(altitudeFt)   || 0
    const heading = headingDeg !== '' ? parseFloat(headingDeg) : null

    let elapsed, total
    if (mode === 'clock') {
      const r = clockToElapsedTotal(depTime, arrTime, timeZone)
      if (!r) return setError('Enter valid departure and arrival times (HH:MM).')
      elapsed = r.elapsedHours; total = r.totalHours
    } else {
      elapsed = parseFloat(elapsedHours)
      total   = parseFloat(totalHours)
      if (isNaN(elapsed) || elapsed < 0) return setError('Enter a valid elapsed time.')
      if (isNaN(total)   || total   <= 0) return setError('Enter a valid total flight time.')
      if (elapsed > total)                return setError('Elapsed time cannot exceed total flight time.')
    }

    try {
      const res = calculateFlight({
        depPos:       { lat: depAirport.lat,  lng: depAirport.lng  },
        destPos:      { lat: destAirport.lat, lng: destAirport.lng },
        elapsedHours: elapsed,
        totalHours:   total,
        altitudeFt:   alt,
        headingDeg:   heading,
        settings,
        date: new Date(),
      })
      setResult(res)
    } catch (e) {
      setError('Calculation failed. Please check your inputs.')
    }
  }, [depAirport, destAirport, mode, elapsedHours, totalHours, depTime, arrTime, timeZone, altitudeFt, headingDeg, settings])

  return {
    inputs:       flightInputs,
    setInputs:    setFlightInputs,
    depAirport,
    destAirport,
    isOffline,
    result,
    error,
    calculate,
  }
}
