// Keeps prayerStore's prayerTimes fresh app-wide, regardless of which tab is
// active, so the dashboard "next prayer" widget never shows stale data.
// Mounted by App.jsx only when a location is already known (see loadLastPosition
// gate there) — so users who've never set a location don't pay for this chunk.
import usePrayerStore     from './store/prayerStore'
import { useGeolocation } from './hooks/useGeolocation'
import { usePrayerTimes } from './hooks/usePrayerTimes'

export default function PrayerBackgroundSync() {
  const { location } = useGeolocation()
  const settings = usePrayerStore(s => s.settings)
  usePrayerTimes(location, settings)
  return null
}
