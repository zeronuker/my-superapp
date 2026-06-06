/**
 * Vercel serverless proxy for the autorouter.aero NOTAM API.
 * Data sourced from Eurocontrol EAD via INO (International NOTAM Operations).
 *
 * Required Vercel environment variables:
 *   AUTOROUTER_EMAIL    – your autorouter.aero login email
 *   AUTOROUTER_PASSWORD – your autorouter.aero login password
 *
 * GET /api/notam?icao=WMKK&pageSize=100
 */

const OAUTH_URL  = 'https://api.autorouter.aero/v1.0/oauth2/token'
const NOTAM_URL  = 'https://api.autorouter.aero/v1.0/notam'
const ICAO_RE    = /^[A-Z0-9]{2,6}$/

// Module-level token cache — survives across warm invocations of the same Lambda
let cachedToken   = null
let tokenExpiresAt = 0   // Unix ms

async function getToken() {
  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt) return cachedToken

  const email    = process.env.AUTOROUTER_EMAIL
  const password = process.env.AUTOROUTER_PASSWORD

  if (!email || !password) {
    throw new Error('AUTOROUTER_EMAIL / AUTOROUTER_PASSWORD env vars not set')
  }

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     email,
    client_secret: password,
  })

  const res = await fetch(OAUTH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
    signal:  AbortSignal.timeout(8_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`autorouter OAuth failed ${res.status}: ${text.slice(0, 120)}`)
  }

  const json = await res.json()
  const token    = json.access_token
  const expiresIn = json.expires_in ?? 3600   // seconds; default 1 h

  if (!token) throw new Error('autorouter OAuth returned no access_token')

  cachedToken    = token
  tokenExpiresAt = now + (expiresIn - 60) * 1000   // refresh 60 s before expiry
  return token
}

export default async function handler(req, res) {
  const { icao, pageSize: pageSizeRaw = '100' } = req.query

  if (!icao) {
    return res.status(400).json({ error: 'icao query parameter is required' })
  }

  const icaoUpper = String(icao).toUpperCase()
  if (!ICAO_RE.test(icaoUpper)) {
    return res.status(400).json({ error: 'icao must be 2–6 alphanumeric characters' })
  }

  const pageSize = Math.min(Math.max(parseInt(pageSizeRaw, 10) || 100, 1), 100)

  // Include NOTAMs valid from 1 hour ago onwards
  const startvalidity = Math.floor(Date.now() / 1000) - 3600

  let token
  try {
    token = await getToken()
  } catch (e) {
    return res.status(503).json({ error: `Auth error: ${e.message}` })
  }

  const url =
    `${NOTAM_URL}` +
    `?itemas=${encodeURIComponent(JSON.stringify([icaoUpper]))}` +
    `&limit=${pageSize}` +
    `&startvalidity=${startvalidity}`

  try {
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(12_000),
    })

    if (upstream.status === 401) {
      // Token may have been invalidated — clear cache and retry once
      cachedToken    = null
      tokenExpiresAt = 0
      const freshToken = await getToken()
      const retry = await fetch(url, {
        headers: { Authorization: `Bearer ${freshToken}` },
        signal:  AbortSignal.timeout(12_000),
      })
      if (!retry.ok) {
        return res.status(retry.status).json({
          error: `NOTAM API returned ${retry.status} for ${icaoUpper}`,
        })
      }
      const data = await retry.json()
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300')
      return res.status(200).json(data)
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `NOTAM API returned ${upstream.status} for ${icaoUpper}`,
      })
    }

    const data = await upstream.json()
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300')
    return res.status(200).json(data)
  } catch (e) {
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'NOTAM API timed out' : String(e),
    })
  }
}
