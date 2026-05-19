const BASE = 'https://aviationweather.gov/api/data'

export default async function handler(req, res) {
  const { ids, type, hours = 3 } = req.query

  if (!ids || !type || !['metar', 'taf'].includes(type)) {
    return res.status(400).json({ error: 'ids and type (metar|taf) are required' })
  }

  const url = `${BASE}/${type}?ids=${encodeURIComponent(ids)}&format=json&hours=${hours}`

  try {
    const upstream = await fetch(url)
    const data = await upstream.json()
    res.setHeader('Cache-Control', 'no-store, no-cache')
    res.status(200).json(data)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
}
