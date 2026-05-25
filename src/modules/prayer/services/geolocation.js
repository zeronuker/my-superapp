// GPS wrapper + geocoding via Nominatim (free, no API key)
const LAST_POS_KEY = 'prayer-last-position'

/**
 * Search for cities by name — returns up to 6 results from anywhere in the world.
 * Used for the location search field in Header.
 */
export async function searchCities(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=8&featuretype=settlement`,
    { headers: { 'Accept-Language': 'en', 'User-Agent': 'ClaudeBorne-SuperApp/1.0' },
      signal: AbortSignal.timeout(8_000) }
  )
  if (!res.ok) throw new Error('City search failed')
  const data = await res.json()

  return data
    .filter(r => r.address)
    .map(r => {
      const a    = r.address
      const city = a.city || a.town || a.village || a.municipality ||
                   a.county || a.state || r.display_name.split(',')[0].trim()
      return {
        name:    city,
        country: a.country || '',
        lat:     parseFloat(r.lat),
        lng:     parseFloat(r.lon),
      }
    })
    // Deduplicate by city + country
    .filter((r, i, arr) =>
      arr.findIndex(x => x.name === r.name && x.country === r.country) === i
    )
    .slice(0, 6)
}

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
