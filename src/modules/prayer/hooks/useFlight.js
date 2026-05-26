import { useState, useEffect, useCallback } from 'react'
import usePrayerStore           from '../store/prayerStore'
import { lookupAirport }        from '../services/airports'
import { calculateFlight }      from '../services/flightCalc'

/**
 * Manages flight mode state, offline detection, and calculation.
 */
export function useFlight() {
  const { flightInputs, setFlightInputs, settings } = usePrayerStore()
  const { dep, dest, elapsedHours, totalHours, altitudeFt, headingDeg } = flightInputs

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

    const elapsed = parseFloat(elapsedHours)
    const total   = parseFloat(totalHours)
    const alt     = parseFloat(altitudeFt)   || 0
    const heading = headingDeg !== '' ? parseFloat(headingDeg) : null

    if (isNaN(elapsed) || elapsed < 0) return setError('Enter a valid elapsed time.')
    if (isNaN(total)   || total   <= 0) return setError('Enter a valid total flight time.')
    if (elapsed > total)                return setError('Elapsed time cannot exceed total flight time.')

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
  }, [depAirport, destAirport, elapsedHours, totalHours, altitudeFt, headingDeg, settings])

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
