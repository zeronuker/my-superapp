import { useState, useEffect, useCallback, useRef } from 'react'
import { getPrayerTimes } from '../services/prayerTimes'
import usePrayerStore from '../store/prayerStore'

/** Local calendar date as YYYY-MM-DD (respects device timezone) */
function localDateStr(d = new Date()) {
  return d.toLocaleDateString('en-CA')   // en-CA always formats as YYYY-MM-DD
}

/**
 * Cache-first prayer time hook.
 *   – Fetches whenever location or settings change.
 *   – Schedules a midnight refresh to load the next day's times automatically.
 *   – Re-fetches on tab/app visibility if the loaded times are from a previous day
 *     (handles the case where the device slept through midnight).
 */
export function usePrayerTimes(location, settings) {
  const [times,   setTimes]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  // Keep mutable refs so the midnight timeout and visibility handler
  // always see the current location, settings, and loaded times
  const locRef      = useRef(location)
  const settRef     = useRef(settings)
  const timesRef    = useRef(null)
  locRef.current    = location
  settRef.current   = settings

  const midnightTimer = useRef(null)

  const fetchTimes = useCallback(async (date = new Date()) => {
    const loc  = locRef.current
    const sett = settRef.current
    if (!loc?.lat || !loc?.lng) return

    setLoading(true)
    setError(null)
    try {
      const result = await getPrayerTimes(
        loc.lat, loc.lng, date,
        sett.calculationMethod, sett.madhab, sett.timeFormat
      )
      setTimes(result)
      timesRef.current = result
      usePrayerStore.getState().setPrayerTimes(result, result.source)
    } catch (err) {
      setError(err.message ?? 'Failed to load prayer times')
    } finally {
      setLoading(false)
    }
  }, []) // stable — uses refs internally

  // Fetch on location / setting changes
  useEffect(() => {
    if (location?.lat && settings) fetchTimes()
  }, [
    location?.lat, location?.lng,
    settings?.calculationMethod, settings?.madhab, settings?.timeFormat,
    fetchTimes,
  ])

  // Schedule midnight refresh (00:01) to pick up next day's times
  useEffect(() => {
    function schedule() {
      if (midnightTimer.current) clearTimeout(midnightTimer.current)
      const now  = new Date()
      const next = new Date(now)
      next.setDate(now.getDate() + 1)
      next.setHours(0, 1, 0, 0)
      midnightTimer.current = setTimeout(() => {
        fetchTimes(new Date())
        schedule()  // reschedule for the following midnight
      }, next - now)
    }
    schedule()
    return () => clearTimeout(midnightTimer.current)
  }, [fetchTimes])

  // Re-fetch when the app/tab becomes visible if times are from a previous day.
  // This catches the common case where the device slept through midnight and
  // the setTimeout never fired.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      const current = timesRef.current
      if (!current) return

      // fajrDate is a Date object; compare its local calendar date to today
      const timesDay = current.fajrDate instanceof Date
        ? localDateStr(current.fajrDate)
        : null

      if (timesDay && timesDay !== localDateStr()) {
        fetchTimes(new Date())
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [fetchTimes])

  return { times, loading, error, refetch: fetchTimes }
}
