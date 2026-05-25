import { useState, useEffect, useCallback, useRef } from 'react'
import { getPrayerTimes } from '../services/prayerTimes'

/**
 * Cache-first prayer time hook.
 *   – Fetches whenever location or settings change.
 *   – Schedules a midnight refresh to load the next day's times automatically.
 */
export function usePrayerTimes(location, settings) {
  const [times,   setTimes]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  // Keep mutable refs so the midnight timeout always sees current values
  const locRef      = useRef(location)
  const settRef     = useRef(settings)
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
      const now   = new Date()
      const next  = new Date(now)
      next.setDate(now.getDate() + 1)
      next.setHours(0, 1, 0, 0)
      const ms = next - now
      midnightTimer.current = setTimeout(() => {
        fetchTimes(new Date())
        schedule()  // reschedule for next midnight
      }, ms)
    }
    schedule()
    return () => clearTimeout(midnightTimer.current)
  }, [fetchTimes])

  return { times, loading, error, refetch: fetchTimes }
}
