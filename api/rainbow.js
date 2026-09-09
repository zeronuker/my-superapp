/**
 * Vercel serverless proxy for Rainbow Weather API (rainbow.ai) — precipitation
 * and clouds map tiles for the Briefing route map, alongside Windy's own
 * wind/temp/pressure overlays. Key is billed (card on file), so unlike Windy's
 * client-side key this one stays server-side only.
 *
 * GET /api/rainbow?resource=snapshot&layer=precip|clouds
 * GET /api/rainbow?resource=precip&snapshot=<ts>&forecast_time=<sec>&z=<z>&x=<x>&y=<y>&color=<0-9>
 * GET /api/rainbow?resource=clouds&snapshot=<ts>&z=<z>&x=<x>&y=<y>
 *
 * Required Vercel environment variable:
 *   RAINBOW_API_KEY — from the API Keys page at developer.rainbow.ai
 */

import { rateLimited } from './_rateLimit.js'

const BASE = 'https://api.rainbow.ai'

function toInt(v) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

export default async function handler(req, res) {
  if (rateLimited(req, res)) return

  const apiKey = process.env.RAINBOW_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'RAINBOW_API_KEY is not configured' })

  const { resource, layer, snapshot, forecast_time: forecastTimeRaw, z, x, y, color } = req.query

  if (resource === 'snapshot') {
    const layerName = layer === 'clouds' ? 'clouds' : 'precip'
    try {
      const upstream = await fetch(`${BASE}/tiles/v1/snapshot?layer=${layerName}&token=${apiKey}`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '')
        return res.status(upstream.status).json({ error: `Rainbow snapshot error ${upstream.status}: ${text.slice(0, 200)}` })
      }
      const data = await upstream.json()
      res.setHeader('Cache-Control', 'no-store, no-cache')
      return res.status(200).json(data)
    } catch (e) {
      const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
      return res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? 'Rainbow API timed out' : String(e) })
    }
  }

  if (resource === 'precip' || resource === 'clouds') {
    const snap = toInt(snapshot), zoom = toInt(z), tileX = toInt(x), tileY = toInt(y)
    if (snap === null || zoom === null || tileX === null || tileY === null) {
      return res.status(400).json({ error: 'snapshot, z, x, y query parameters are required' })
    }
    const maxZoom = resource === 'clouds' ? 7 : 12
    if (zoom < 0 || zoom > maxZoom) return res.status(400).json({ error: `zoom must be 0-${maxZoom} for ${resource}` })

    let path
    if (resource === 'precip') {
      const forecastTime = toInt(forecastTimeRaw) ?? 0
      if (forecastTime < 0 || forecastTime > 14400 || forecastTime % 600 !== 0) {
        return res.status(400).json({ error: 'forecast_time must be 0-14400 in 600s steps' })
      }
      const colorParam = color ? `?color=${encodeURIComponent(color)}` : ''
      path = `/tiles/v1/precip/${snap}/${forecastTime}/${zoom}/${tileX}/${tileY}${colorParam}`
    } else {
      path = `/tiles/v1/clouds/${snap}/${zoom}/${tileX}/${tileY}`
    }

    try {
      const sep = path.includes('?') ? '&' : '?'
      const upstream = await fetch(`${BASE}${path}${sep}token=${apiKey}`, { signal: AbortSignal.timeout(8000) })
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '')
        return res.status(upstream.status).json({ error: `Rainbow ${resource} tile error ${upstream.status}: ${text.slice(0, 200)}` })
      }
      const buf = Buffer.from(await upstream.arrayBuffer())
      // A given snapshot's tile content never changes — safe to cache hard.
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
      res.setHeader('Content-Type', 'image/png')
      return res.status(200).send(buf)
    } catch (e) {
      const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
      return res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? 'Rainbow API timed out' : String(e) })
    }
  }

  return res.status(400).json({ error: 'resource must be snapshot, precip, or clouds' })
}
