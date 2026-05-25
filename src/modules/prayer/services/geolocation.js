// GPS wrapper + reverse geocoding via Nominatim (free, no API key)
const LAST_POS_KEY = 'prayer-last-position'

export function loadLastPosition() {
  try {
    const raw = localStorage.getItem(LAST_POS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveLastPosition(lat, lng, city, country) {
  try {
    localStorage.setItem(LAST_POS_KEY, JSON.stringify({ lat, lng, city, country, timestamp: Date.now() }))
  } catch { /* ignore */ }
}

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported by this browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos  => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err  => reject(err),
      { timeout: 12_000, maximumAge: 60_000, enableHighAccuracy: false }
    )
  })
}

export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'ClaudeBorne-SuperApp/1.0' },
        signal: AbortSignal.timeout(8_000) }
    )
    if (!res.ok) throw new Error('Nominatim error')
    const data = await res.json()
    const a = data.address
    const city    = a.city || a.town || a.village || a.county || a.state || 'Unknown'
    const country = a.country || ''
    return { city, country }
  } catch {
    return { city: 'Current Location', country: '' }
  }
}
