import { useState, useEffect, useCallback, useMemo } from 'react'
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

// Convert "HH:MM local time in tzId on dateStr (YYYY-MM-DD)" → UTC epoch ms.
// Uses a one-iteration Intl trick: accurate to within DST-transition rounding (~1 min).
function localTzToUtcMs(dateStr, h, m, tzId) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tzId,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  })
  const toLocalMs = (utcMs) => {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map(({ type, value }) => [type, value]))
    return Date.UTC(
      parseInt(parts.year), parseInt(parts.month) - 1, parseInt(parts.day),
      parseInt(parts.hour) % 24, parseInt(parts.minute), parseInt(parts.second),
    )
  }
  const approx1 = Date.UTC(y, mo - 1, d, h, m, 0)
  const result1 = approx1 + (approx1 - toLocalMs(approx1))
  // Second iteration eliminates the ~1-min DST-transition rounding error
  return result1 + (approx1 - toLocalMs(result1))
}

// "YYYY-MM-DD" of `now` as seen in tzId's own calendar (not the device/UTC date).
function localDateStr(tzId, now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tzId, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now).map(({ type, value }) => [type, value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

// Returns "UTC+8", "UTC-5", "UTC+5:30" etc. for an IANA timezone ID.
export function getUtcOffsetStr(tzId) {
  if (!tzId) return ''
  const now = new Date()
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tzId,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false,
    }).formatToParts(now).map(({ type, value }) => [type, value])
  )
  const localMs = Date.UTC(
    parseInt(parts.year), parseInt(parts.month) - 1, parseInt(parts.day),
    parseInt(parts.hour) % 24, parseInt(parts.minute), parseInt(parts.second),
  )
  const totalMin = Math.round((localMs - now.getTime()) / 60_000)
  const sign = totalMin >= 0 ? '+' : '-'
  const absMin = Math.abs(totalMin)
  const hh = Math.floor(absMin / 60)
  const mm = absMin % 60
  return mm > 0 ? `UTC${sign}${hh}:${String(mm).padStart(2, '0')}` : `UTC${sign}${hh}`
}

// Formats a Date instant as "HH:MM" (or 12hr) in tzId — e.g. the same in-flight
// prayer moment shown on a departure-zone watch vs an arrival-zone watch.
// Falls back to device-local formatting when tzId is unavailable.
export function formatInTz(date, tzId, timeFormat = '24hr') {
  if (!(date instanceof Date)) return '--:--'
  let h, m
  if (tzId) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tzId, hour: 'numeric', minute: '2-digit', hour12: false,
      }).formatToParts(date).map(({ type, value }) => [type, value])
    )
    h = parseInt(parts.hour) % 24
    m = parts.minute
  } else {
    h = date.getHours()
    m = String(date.getMinutes()).padStart(2, '0')
  }
  if (timeFormat === '12hr') return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`
  return `${String(h).padStart(2, '0')}:${m}`
}

// From dep/arr clock times → elapsed + total hours.
// tz: 'utc' | 'local'
// depTzId / destTzId: IANA strings (e.g. "Asia/Kuala_Lumpur"). Required for
//   timezone-aware local mode; falls back to device local time when absent.
// dep assumed most-recent occurrence; arr before dep (UTC) wraps to next day.
export function clockToElapsedTotal(depTime, arrTime, tz, now = new Date(), depTzId = null, destTzId = null) {
  const dM = hmToMin(depTime), aM = hmToMin(arrTime)
  if (dM == null || aM == null) return null

  const nowMs = now.getTime()
  let depMs, arrMs

  if (tz === 'utc') {
    depMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Math.floor(dM / 60), dM % 60)
    if (depMs > nowMs) depMs -= 86_400_000
    let durMin = ((aM - dM) % 1440 + 1440) % 1440
    if (durMin === 0) durMin = 1440
    arrMs = depMs + durMin * 60_000
  } else if (tz === 'local' && depTzId && destTzId) {
    // Timezone-aware: dep in depTzId, arr in destTzId.
    // Anchor dep to its OWN current local calendar date — using the device's
    // UTC date here would misfire whenever the dep tz's calendar day has
    // already rolled over relative to UTC (e.g. UTC+8 mornings), throwing the
    // elapsed-time calculation off by a full day.
    depMs = localTzToUtcMs(localDateStr(depTzId, now), Math.floor(dM / 60), dM % 60, depTzId)
    if (depMs > nowMs) depMs -= 86_400_000
    // Anchor arr to the DEPARTURE INSTANT's calendar date in destTzId, not to
    // "today" — anchoring both ends independently to "today" let them land on
    // different days whenever only one side needed its rollback applied,
    // inflating total flight time by up to 24h.
    arrMs = localTzToUtcMs(localDateStr(destTzId, new Date(depMs)), Math.floor(aM / 60), aM % 60, destTzId)
    if (arrMs <= depMs) arrMs += 86_400_000
  } else {
    // Fallback: device local time (original behaviour, no tz data)
    const d = new Date(now); d.setHours(Math.floor(dM / 60), dM % 60, 0, 0); depMs = d.getTime()
    if (depMs > nowMs) depMs -= 86_400_000
    let durMin = ((aM - dM) % 1440 + 1440) % 1440
    if (durMin === 0) durMin = 1440
    arrMs = depMs + durMin * 60_000
  }

  const totalMs = arrMs - depMs
  if (totalMs <= 0) return null
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

  // ── Clock mode info (for banner, reactive) ───────────────────────────────────
  // Provides total flight time + timezone labels without needing CALCULATE press.
  const clockInfo = useMemo(() => {
    if (mode !== 'clock') return null
    const dM = hmToMin(depTime), aM = hmToMin(arrTime)
    if (dM == null || aM == null) return null

    if (timeZone === 'utc') {
      let durMin = ((aM - dM) % 1440 + 1440) % 1440
      if (durMin === 0) durMin = 1440
      return { totalHours: durMin / 60, depTzStr: 'UTC', destTzStr: 'UTC', tzAware: true }
    }

    // Local mode with tz data
    if (depAirport?.tz && destAirport?.tz) {
      const now = new Date()
      const depMs = localTzToUtcMs(localDateStr(depAirport.tz, now), Math.floor(dM / 60), dM % 60, depAirport.tz)
      let arrMs   = localTzToUtcMs(localDateStr(destAirport.tz, new Date(depMs)), Math.floor(aM / 60), aM % 60, destAirport.tz)
      if (arrMs <= depMs) arrMs += 86_400_000
      const totalHrs = (arrMs - depMs) / 3_600_000
      if (totalHrs <= 0) return null
      return {
        totalHours: totalHrs,
        depTzStr:   getUtcOffsetStr(depAirport.tz),
        destTzStr:  getUtcOffsetStr(destAirport.tz),
        tzAware:    true,
      }
    }

    // Fallback: simple local duration (airport tz unknown)
    let durMin = ((aM - dM) % 1440 + 1440) % 1440
    if (durMin === 0) durMin = 1440
    return { totalHours: durMin / 60, depTzStr: null, destTzStr: null, tzAware: false }
  }, [mode, timeZone, depTime, arrTime, depAirport, destAirport])

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
      const r = clockToElapsedTotal(depTime, arrTime, timeZone, new Date(), depAirport?.tz ?? null, destAirport?.tz ?? null)
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

  // ── Auto-refresh ──────────────────────────────────────────────────────────────
  // Result state is local to this hook, so it's lost whenever the Flight tab
  // unmounts (switching to Solat/Qiblat and back). Recompute on mount so it
  // reappears instead of requiring another CALCULATE press. Skipped on a
  // blank first-time form so no error flashes before a route is entered.
  useEffect(() => {
    if (dep && dest) calculate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The component above stays mounted while the OS backgrounds the app (screen
  // lock, switching to another app) — no remount to catch that, so listen for
  // the tab/app coming back to the foreground instead.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && dep && dest) calculate()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [calculate, dep, dest])

  return {
    inputs:       flightInputs,
    setInputs:    setFlightInputs,
    depAirport,
    destAirport,
    isOffline,
    clockInfo,
    result,
    error,
    calculate,
  }
}
