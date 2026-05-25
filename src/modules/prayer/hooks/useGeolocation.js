import { useState, useCallback } from 'react'
import {
  getCurrentPosition,
  reverseGeocode,
  loadLastPosition,
  saveLastPosition,
} from '../services/geolocation'

/**
 * Manages device GPS + reverse geocode.
 * On mount: restores last known position from localStorage (no spinner on re-open).
 * Does NOT auto-locate — locate() must be called from a user gesture so Android
 * Chrome shows the full permission dialog instead of silently denying it.
 */
export function useGeolocation() {
  const lastPos = loadLastPosition()

  const [location, setLocationState] = useState(
    lastPos
      ? { lat: lastPos.lat, lng: lastPos.lng, city: lastPos.city, country: lastPos.country, source: 'gps' }
      : null
  )
  const [status, setStatus] = useState(lastPos ? 'ready' : 'idle')
  const [error,  setError]  = useState(null)

  const locate = useCallback(async () => {
    setStatus('locating')
    setError(null)
    try {
      const { lat, lng } = await getCurrentPosition()
      const { city, country } = await reverseGeocode(lat, lng)
      const loc = { lat, lng, city, country, source: 'gps' }
      saveLastPosition(lat, lng, city, country)
      setLocationState(loc)
      setStatus('ready')
      return loc
    } catch (err) {
      setError(err.message ?? 'Location unavailable')
      setStatus('error')
      return null
    }
  }, [])

  // Manual city pick — bypasses GPS
  const setManualLocation = useCallback((city, country, lat, lng) => {
    const loc = { lat, lng, city, country, source: 'manual' }
    setLocationState(loc)
    setStatus('ready')
    setError(null)
  }, [])

  return { location, status, error, locate, setManualLocation }
}
