import { useState, useEffect, useCallback } from 'react'
import { qiblaBearing } from '../services/qibla'

/**
 * Live Qibla compass hook.
 *
 * – Calculates static bearing from location whenever location changes.
 * – Attempts to start DeviceOrientationEvent listener automatically.
 *   On iOS 13+ this requires a user gesture — `permissionNeeded` will be true;
 *   call `requestPermission()` from a button onClick to trigger the prompt.
 * – `needleAngle`: the angle to rotate the compass needle on screen so it
 *   points toward Mecca regardless of device orientation.
 */
export function useQibla(location) {
  const [bearing,         setBearing]         = useState(null)
  const [heading,         setHeading]         = useState(null)   // device compass heading (°)
  const [live,            setLive]            = useState(false)
  const [permissionNeeded, setPermissionNeeded] = useState(false)

  // Recalculate static bearing when location changes
  useEffect(() => {
    if (location?.lat != null && location?.lng != null) {
      setBearing(qiblaBearing(location.lat, location.lng))
    }
  }, [location?.lat, location?.lng])

  const attachListener = useCallback(() => {
    let fired = false

    const handler = (e) => {
      let h = null
      // iOS: webkitCompassHeading (clockwise from north, 0–360)
      if (e.webkitCompassHeading != null) {
        h = e.webkitCompassHeading
      }
      // Android: alpha is counter-clockwise from north — invert
      else if (e.alpha != null) {
        h = (360 - e.alpha) % 360
      }

      if (h != null) {
        setHeading(h)
        if (!fired) { setLive(true); fired = true }
      }
    }

    window.addEventListener('deviceorientation', handler, true)
    return () => window.removeEventListener('deviceorientation', handler, true)
  }, [])

  // Try to start automatically (works on Android / desktop with sensors)
  useEffect(() => {
    // iOS 13+ requires explicit requestPermission on a user gesture
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      setPermissionNeeded(true)
      return
    }
    const cleanup = attachListener()
    return cleanup
  }, [attachListener])

  // Called from CompassDial tap (iOS 13+)
  const requestPermission = useCallback(async () => {
    try {
      const result = await DeviceOrientationEvent.requestPermission()
      if (result === 'granted') {
        setPermissionNeeded(false)
        return attachListener()
      }
    } catch { /* user denied or not iOS */ }
  }, [attachListener])

  // Needle angle: offset qibla bearing by device heading so needle always points to Mecca
  const needleAngle = live && heading != null && bearing != null
    ? (bearing - heading + 360) % 360
    : (bearing ?? 0)

  return {
    bearing,          // static great-circle bearing (degrees)
    heading,          // device compass heading (degrees, or null)
    needleAngle,      // final rotation to apply to the compass needle
    live,             // true when DeviceOrientation is firing
    permissionNeeded, // true on iOS before user grants permission
    requestPermission,
  }
}
