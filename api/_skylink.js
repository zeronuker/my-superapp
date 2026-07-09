/**
 * Shared SkyLink API client — RapidAPI-hosted, static key auth (no OAuth
 * exchange, unlike api/notam.js). Base URL, header names, and endpoint paths
 * confirmed against the SDK source at github.com/skylinkapi/aviation-sdk.
 *
 * Required Vercel environment variable:
 *   SKYLINK_API_KEY — the X-RapidAPI-Key from rapidapi.com/skylink/api/skylink-api
 */

const BASE = 'https://skylink-api.p.rapidapi.com'
const HOST = 'skylink-api.p.rapidapi.com'

export async function skylinkFetch(path, params = {}, timeoutMs = 8000) {
  const apiKey = process.env.SKYLINK_API_KEY
  if (!apiKey) {
    const err = new Error('SKYLINK_API_KEY is not configured')
    err.isConfigError = true
    throw err
  }

  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const url = `${BASE}${path}${qs.toString() ? `?${qs.toString()}` : ''}`

  return fetch(url, {
    headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': HOST },
    signal: AbortSignal.timeout(timeoutMs),
  })
}

// Shared error → HTTP response mapping for the three skylink-*.js handlers.
export async function handleSkylinkError(e, res) {
  if (e?.isConfigError) {
    return res.status(500).json({ error: e.message })
  }
  const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError'
  return res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? 'SkyLink API timed out' : String(e) })
}
