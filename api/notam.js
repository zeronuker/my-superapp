/**
 * Vercel serverless proxy for the autorouter.aero NOTAM API.
 * Data sourced from Eurocontrol EAD via INO (International NOTAM Operations).
 *
 * Required Vercel environment variables:
 *   AUTOROUTER_EMAIL    – your autorouter.aero login email
 *   AUTOROUTER_PASSWORD – your autorouter.aero login password
 *
 * GET /api/notam?icao=WMKK
 * GET /api/notam?icaos=WMKK,WSSS,WMFC      (one request for several locations)
 *
 * One autorouter call covers all the locations, so a briefing costs at most
 * one login instead of one per airport (see _autorouterToken.js).
 */

import { rateLimited } from './_rateLimit.js'
import { getToken, invalidateToken } from './_autorouterToken.js'

const NOTAM_URL = 'https://api.autorouter.aero/v1.0/notam'
const ICAO_RE = /^[A-Z0-9]{2,6}$/
const MAX_LOCATIONS = 12
const PAGE_SIZE = 100   // autorouter's maximum rows per call
const MAX_PAGES = 8     // 800 rows per request, so a busy briefing isn't silently cut short

function fetchPage(token, itemas, startvalidity, offset) {
  const url =
    `${NOTAM_URL}` +
    `?itemas=${encodeURIComponent(JSON.stringify(itemas))}` +
    `&limit=${PAGE_SIZE}` +
    `&offset=${offset}` +
    `&startvalidity=${startvalidity}`
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12_000),
  })
}

// Every row for the given locations: pages through the results until autorouter's
// reported total is reached (or MAX_PAGES). A 401 means the token was invalidated,
// so log in again and retry once.
async function collectRows(itemas, startvalidity) {
  let token = await getToken()
  let retried = false
  const rows = []
  let total = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    let r = await fetchPage(token, itemas, startvalidity, rows.length)
    if (r.status === 401 && !retried) {
      retried = true
      invalidateToken()
      token = await getToken()
      r = await fetchPage(token, itemas, startvalidity, rows.length)
    }
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      const err = new Error(`NOTAM API returned ${r.status}`)
      err.status = r.status
      err.detail = text.slice(0, 200)
      throw err
    }
    const data = await r.json()
    const got = data?.rows ?? []
    total = data?.total ?? got.length
    rows.push(...got)
    if (!got.length || rows.length >= total) break
  }
  return { total, rows }
}

export default async function handler(req, res) {
  if (rateLimited(req, res, { limit: 30, windowMs: 60_000 })) return

  const raw = String(req.query.icaos ?? req.query.icao ?? '')
  const icaos = [...new Set(raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))]

  if (!icaos.length) {
    return res.status(400).json({ error: 'icao or icaos query parameter is required' })
  }
  if (icaos.length > MAX_LOCATIONS) {
    return res.status(400).json({ error: `at most ${MAX_LOCATIONS} locations per request` })
  }
  if (!icaos.every(x => ICAO_RE.test(x))) {
    return res.status(400).json({ error: 'each icao must be 2–6 alphanumeric characters' })
  }

  // Include NOTAMs valid from 1 hour ago onwards
  const startvalidity = Math.floor(Date.now() / 1000) - 3600
  const label = icaos.join(',')

  try {
    const data = await collectRows(icaos, startvalidity)
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300')
    return res.status(200).json(data)
  } catch (e) {
    if (e.status) {
      console.error(`[notam] upstream failed ${e.status} for ${label}: ${e.detail}`)
      return res.status(e.status).json({ error: `NOTAM API returned ${e.status} for ${label}` })
    }
    if (/OAuth|env vars|login limit/i.test(e.message)) {
      console.error(`[notam] getToken failed: ${e.message}`)
      return res.status(503).json({ error: `Auth error: ${e.message}` })
    }
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    console.error(`[notam] ${isTimeout ? 'timeout' : 'fetch error'} for ${label}: ${e}`)
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'NOTAM API timed out' : String(e),
    })
  }
}
