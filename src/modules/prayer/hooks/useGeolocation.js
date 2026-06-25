import { useState, useCallback, useEffect } from 'react'
import {
  getCurrentPosition,
  reverseGeocode,
  loadLastPosition,
  saveLastPosition,
} from '../services/geolocation'

/**
 * Manages device GPS + reverse geocode.
 *
 * On mount: checks the Permissions API to determine geolocation state:
 *   'granted'  → auto-locate immediately (no popup needed)
 *   'prompt'   → wait for user gesture to call locate()
 *   'denied'   → expose permissionState so UI can show reset instructions
 *
 * Restores last known position from localStorage so returning users
 * never see a spinner while permission resolves.
 */
export function useGeolocation() {
  const [location, setLocationState] = useState(() => {
    const lastPos = loadLastPosition()
    return lastPos
      ? { lat: lastPos.lat, lng: lastPos.lng, city: lastPos.city, country: lastPos.country, source: 'gps' }
      : null
  })
  const [status,          setStatus]          = useState(() => loadLastPosition() ? 'ready' : 'idle')
  const [error,           setError]           = useState(null)
  const [permissionState, setPermissionState] = useState('unknown') // 'granted'|'denied'|'prompt'|'unknown'

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
      setPermissionState('granted')
      return loc
    } catch (err) {
      const msg = err.message ?? 'Location unavailable'
      setError(msg)
      setStatus('error')
      // If the error is a GeolocationPositionError code 1 = PERMISSION_DENIED
      if (err.code === 1) setPermissionState('denied')
      return null
    }
  }, [])

  // Check Permissions API on mount — auto-locate if already granted
  useEffect(() => {
    if (!navigator.permissions) return
    navigator.permissions.query({ name: 'geolocation' }).then(result => {
      setPermissionState(result.state)

      // Already granted → safe to auto-locate without triggering a popup
      if (result.state === 'granted' && !location) locate()

      // Listen for the user granting/denying from the browser settings page
      result.onchange = () => setPermissionState(result.state)
    }).catch(() => {
      // Permissions API not supported — fall back to unknown, let user tap
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Manual city pick — bypasses GPS
  const setManualLocation = useCallback((city, country, lat, lng) => {
    const loc = { lat, lng, city, country, source: 'manual' }
    setLocationState(loc)
    setStatus('ready')
    setError(null)
  }, [])

  return { location, status, error, permissionState, locate, setManualLocation }
}
