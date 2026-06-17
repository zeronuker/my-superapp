/**
 * Vercel serverless proxy for Nominatim (OpenStreetMap geocoding).
 * Sets the required User-Agent that browsers cannot set via fetch().
 * Nominatim ToS: https://operations.osmfoundation.org/policies/nominatim/
 *
 * GET /api/geocode?type=search&q=Kuala+Lumpur
 * GET /api/geocode?type=reverse&lat=3.1390&lng=101.6869
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const UA        = 'ClaudeBorne-SuperApp (https://github.com/zeronuker/my-superapp)'

export default async function handler(req, res) {
  const { type, q, lat, lng } = req.query

  let url
  if (type === 'search') {
    if (!q) return res.status(400).json({ error: 'Missing q' })
    url = `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=8&featuretype=settlement`
  } else if (type === 'reverse') {
    if (!lat || !lng) return res.status(400).json({ error: 'Missing lat/lng' })
    url = `${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`
  } else {
    return res.status(400).json({ error: 'type must be search or reverse' })
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent':      UA,
        'Accept-Language': 'en',
        'Accept':          'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Nominatim ${upstream.status}` })
    }

    const data = await upstream.json()
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
    return res.status(200).json(data)
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Geocode proxy error' })
  }
}
